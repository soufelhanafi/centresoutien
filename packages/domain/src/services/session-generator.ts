import type { RandomPort } from '../ports/random-port';
import type { WeekdayIndex } from '../value-objects/weekday';
import { toMinutes } from '../value-objects/time-of-day';
import { intersectTimeWindows, type TimeWindow } from '../value-objects/time-window';
import type { EntityId } from '../value-objects/ids';
import type { GroupId, GroupKind } from '../entities/group';
import type { TeacherId } from '../entities/teacher';
import type { RoomId } from '../entities/room';
import type { StudentId } from '../entities/student';
import type { ScheduledSessionRef } from '../errors/scheduling-errors';
import { strictlyOverlaps, type DayHours } from '../policies/session-conflict-policy';
import { weeklyBlockInFittingWindow, type WeeklyBlock } from '../value-objects/weekly-block';
import { gapViolations, satisfiesMinGap, type WeekdayGap } from '../policies/weekday-gap';
import { endDateAfterWeekdayOccurrences, type DateRange } from '../value-objects/date-range';
import {
  detectGeneratedScheduleConflicts,
  generatedCandidateToScheduledRef,
  type GeneratedBlockCandidate,
  type GeneratedScheduleConflict,
  type GeneratorAvailabilityContext,
  type GeneratorSeatCapacities,
} from '../policies/generated-schedule-conflicts';
import { teacherUnavailability, type TeacherAvailabilityRules } from '../policies/teacher-availability-policy';
import { WEEKDAYS } from '../value-objects/weekday';
import {
  GroupExceedsRoomCapacityError,
  InfeasibleGeneratorConfigError,
  NoRoomsConfiguredError,
} from '../errors/session-generator-errors';

/** Which groups and teachers the run targets; the caller resolves `'all'` to concrete ids. */
export type SessionGeneratorScope = {
  readonly groups: 'all' | readonly GroupId[];
  readonly teachers: 'all' | readonly TeacherId[];
};

/**
 * The window the generated pattern is meant to fill — either a closed
 * `[startDate, endDate]` civil-date span or an open `startDate` plus a count of
 * occurrences. The pure engine carries it for provenance only; materializing the
 * weekly pattern into dated `Session` rows over this window is {@link GenerateSessions}
 * (SOU-130) / SOU-161, not this weekly-pattern step.
 */
export type SessionGeneratorRange =
  | { readonly startDate: string; readonly endDate: string }
  | { readonly startDate: string; readonly occurrenceCount: number };

type SessionGeneratorConfigBase = {
  readonly scope: SessionGeneratorScope;
  readonly kind: GroupKind;
  readonly weekdayPool: readonly WeekdayIndex[];
  readonly sessionsPerWeek: number;
  readonly minGapDays: number;
  readonly sessionDurationMinutes: number;
  readonly range: SessionGeneratorRange;
};

/**
 * A generator run. `mode` discriminates the two flows: `auto` has the engine
 * propose the weekday set; `custom` supplies `pickedWeekdays` the admin chose and
 * the engine only validates (flagging, never blocking, gap breaches).
 * `minGapDays` is settable per run, so a caller wanting tighter exam-prep cycles
 * simply runs the generator again with `kind: 'exam-prep'` and a smaller gap —
 * no per-kind field is needed.
 */
export type SessionGeneratorConfig =
  | (SessionGeneratorConfigBase & { readonly mode: 'auto' })
  | (SessionGeneratorConfigBase & {
      readonly mode: 'custom';
      readonly pickedWeekdays: readonly WeekdayIndex[];
    });

/**
 * One generated block paired with the room it was assigned (SOU-158). Every
 * persisted `WeeklyRecurringSession` needs a `roomId`, so the engine never
 * returns a bare `WeeklyBlock` — {@link SessionGenerator} picks the room as
 * part of the same run.
 */
export type ScheduledBlockProposal = {
  readonly block: WeeklyBlock;
  readonly roomId: RoomId;
  readonly teacherId: EntityId | null;
};

/**
 * One group's proposed weekly pattern plus any gap breaches (always empty in
 * auto mode). `requestedSessionsPerWeek` is `config.sessionsPerWeek` in auto
 * mode (or `pickedWeekdays.length` in custom mode, which never falls short) —
 * the caller compares it against `blocks.length` to detect a shortfall
 * (SOU-296): auto mode never places a block outside a teacher's declared
 * availability or closer together than `minGapDays`, so either constraint can
 * independently yield fewer blocks than asked for instead of a forced invalid
 * placement. `shortfallReason` tells the caller which one, since the two need
 * different remediation (declare more availability vs loosen the spacing or
 * accept fewer sessions) and a single generic message conflating them is
 * actively misleading — see {@link SessionGenerator.placeAutoGroup}.
 */
export type GroupScheduleProposal = {
  readonly groupId: GroupId;
  readonly blocks: readonly ScheduledBlockProposal[];
  readonly gapViolations: readonly WeekdayGap[];
  readonly requestedSessionsPerWeek: number;
  readonly shortfallReason: 'teacher-availability' | 'min-gap' | null;
};

/**
 * `conflicts` (SOU-161) never blocks — every proposal in `proposals` is still
 * fully returned even when it clashes. It surfaces two things the room-picking
 * and weekday-placement steps can't see on their own: a block whose `end` runs
 * past the center's closing time, and a room/teacher double-booked at an overlapping
 * weekday+time — either against `SessionGenerationInput.existingSchedule` or
 * against a sibling proposal generated in this same run. The caller (the
 * SOU-159 preview) decides what to do with a non-empty list; nothing here ever
 * throws for a conflict.
 */
export type SessionGeneratorResult = {
  readonly proposals: readonly GroupScheduleProposal[];
  readonly conflicts: readonly GeneratedScheduleConflict[];
};

/**
 * The scope-resolved inputs a run needs: the config, the concrete `groups` the
 * caller expanded from `config.scope` (resolving `'all'` needs a repository —
 * out of this pure engine), the teacher staffing each group (nullable and typed
 * `EntityId` rather than `TeacherId`, mirroring `Group.teacherId` — the Teacher
 * entity's brand isn't wired through here yet), the pool of rooms the run may
 * assign from, the center's opening hours per weekday, and the real,
 * already-committed schedule (SOU-161) the caller pre-scoped to same-center,
 * non-soft-deleted, active refs — used only to detect room/teacher conflicts,
 * never to change what gets generated.
 */
export type SessionGenerationInput = {
  readonly config: SessionGeneratorConfig;
  readonly groups: readonly GroupId[];
  readonly teacherByGroup: ReadonlyMap<GroupId, EntityId | null>;
  readonly rooms: readonly RoomId[];
  readonly centerHours: readonly DayHours[];
  readonly existingSchedule: readonly ScheduledSessionRef[];
  /**
   * SOU-259: declared availability per configured teacher — teachers with no
   * configuration are simply absent and never checked. Optional so callers
   * without the feature (or its plan flag) pass nothing and the run behaves
   * exactly as before.
   */
  readonly availabilityByTeacher?: ReadonlyMap<EntityId, TeacherAvailabilityRules>;
  /**
   * SOU-272: seat capacity of each assignable room and each scoped group. When
   * both are present the room draw honors the seat-fit invariant that
   * {@link CreateWeeklyRecurringSession} enforces at commit — so the generator
   * never proposes a room too small to seat the group, and auto mode fails fast
   * when a group outgrows every room. Optional: absent maps reproduce the
   * pre-SOU-272 seat-blind behavior exactly.
   */
  readonly roomCapacities?: ReadonlyMap<RoomId, number>;
  readonly groupCapacities?: ReadonlyMap<GroupId, number>;
  /**
   * Live roster (student ids) per scoped group. When present, the final
   * conflict pass additionally flags a student double-booked across two of
   * this run's groups (checked only against this run's own candidates, never
   * the real committed schedule — see {@link detectGeneratedScheduleConflicts}).
   * Optional: absent reproduces the pre-existing student-blind behavior exactly.
   */
  readonly rosterByGroup?: ReadonlyMap<GroupId, readonly StudentId[]>;
};

/**
 * Resolves a run's {@link SessionGeneratorRange} to the concrete `[start, end]`
 * window one committed template (single-weekday, `weekday`) materializes over.
 * The `{ startDate, endDate }` variant passes straight through — it already
 * names both bounds. The `{ startDate, occurrenceCount }` variant is converted
 * per template via {@link endDateAfterWeekdayOccurrences}: two templates
 * committed from the same run can land on different weekdays, so each gets its
 * own end date computed from its own weekday's distance to `startDate` — never
 * one shared end date guessed from the first template alone.
 */
export function resolveGeneratorMaterializationRange(
  range: SessionGeneratorRange,
  weekday: WeekdayIndex,
): DateRange {
  if ('endDate' in range) return { start: range.startDate, end: range.endDate };
  return {
    start: range.startDate,
    end: endDateAfterWeekdayOccurrences(range.startDate, weekday, range.occurrenceCount),
  };
}

/**
 * The per-run inputs every group placement reads, bundled so the placement
 * helpers stay small. `existingSchedule` is the real, already-committed schedule
 * (SOU-161); the mutable list of blocks committed earlier *in this same run* is
 * threaded separately, since it grows group by group.
 */
type GroupPlacementContext = {
  readonly windowsByWeekday: ReadonlyMap<WeekdayIndex, readonly TimeWindow[]>;
  readonly rooms: readonly RoomId[];
  readonly teacherByGroup: ReadonlyMap<GroupId, EntityId | null>;
  readonly existingSchedule: readonly ScheduledSessionRef[];
  readonly centerHours: readonly DayHours[];
  readonly availability: GeneratorAvailabilityContext | undefined;
  readonly seatFit: SeatFit | undefined;
};

/**
 * One flattened block across every group in a run — the atomic unit
 * {@link assignRoomsToBlocks} reasons about. Kept as its own exported shape (not
 * folded back into `GroupScheduleProposal`) so the room-assignment step is a
 * small, independently testable pure function: callers can hand it hand-built
 * blocks with exact times, without going through weekday placement, to exercise
 * the teacher room-continuity rule directly.
 */
export type UnroomedBlock = {
  readonly groupId: GroupId;
  readonly teacherId: EntityId | null;
  readonly block: WeeklyBlock;
};

/**
 * The seat-fit inputs the room draw reads (SOU-272): how many seats each group
 * needs and how many each room holds. A room absent from `roomCapacity` is
 * treated as unbounded (never wrongly excluded), and a group absent from
 * `seatsByGroup` imposes no seat constraint — so an entirely undefined
 * {@link SeatFit} reproduces the pre-SOU-272 seat-blind draw exactly.
 */
export type SeatFit = GeneratorSeatCapacities;

function roomSeatsGroup(seatFit: SeatFit | undefined, groupId: GroupId, roomId: RoomId): boolean {
  const seats = seatFit?.seatsByGroup.get(groupId);
  if (seatFit === undefined || seats === undefined) return true;
  return (seatFit.roomCapacity.get(roomId) ?? Number.POSITIVE_INFINITY) >= seats;
}

/**
 * The candidate rooms to draw one block's room from, in descending preference:
 * free-and-seats-the-group, then any room that seats it (accepting a surfaced
 * double-book, since seat overflow is a hard commit invariant and a clash is a
 * soft one), then any free room, and only then the full pool. With no seat data
 * `seats` is always true, so this collapses to "free rooms, else the full pool"
 * — the pre-SOU-272 collision-aware behavior (SOU-261).
 */
function preferredRoomPool(
  rooms: readonly RoomId[],
  taken: ReadonlySet<RoomId>,
  seats: (roomId: RoomId) => boolean,
): readonly RoomId[] {
  const free = rooms.filter((roomId) => !taken.has(roomId));
  const freeAndSeats = free.filter(seats);
  if (freeAndSeats.length > 0) return freeAndSeats;
  const anySeats = rooms.filter(seats);
  if (anySeats.length > 0) return anySeats;
  if (free.length > 0) return free;
  return rooms;
}

/**
 * Assigns a room to every entry in `blocks`, processed earliest-start-first
 * regardless of caller order (greedy interval coloring is only optimal in that
 * order), drawing via `random` from the rooms still **free at that entry's
 * weekday+time** (SOU-261):
 * a room already given to an overlapping sibling in this same batch, or held by
 * an overlapping `occupied` ref from the real committed schedule, is excluded
 * from the draw. Only when every room is taken at that slot does the draw fall
 * back to the full pool — the resulting double-booking is then surfaced by
 * {@link detectGeneratedScheduleConflicts}, never silently avoided by dropping
 * the block. Back-to-back continuity still wins over the free-room draw: when
 * the same teacher has another entry in this list back-to-back on the same
 * weekday (one block's `end` equals another's `start`), the later block reuses
 * the earlier one's room, chains propagating through every link. Throws
 * {@link NoRoomsConfiguredError} when `blocks` is non-empty and `rooms` is
 * empty — every generated block needs a room.
 */
export function assignRoomsToBlocks(
  blocks: readonly UnroomedBlock[],
  rooms: readonly RoomId[],
  random: RandomPort,
  occupied: readonly ScheduledSessionRef[] = [],
  seatFit?: SeatFit,
): ReadonlyMap<WeeklyBlock, RoomId> {
  if (blocks.length === 0) return new Map();
  if (rooms.length === 0) throw new NoRoomsConfiguredError();

  const predecessorOf = linkBackToBackChains(blocks);
  const roomByEntry = new Map<UnroomedBlock, RoomId>();
  const occupiedByDay = groupRefsByDay(occupied);

  const roomsTakenAtSlot = (entry: UnroomedBlock): ReadonlySet<RoomId> => {
    const taken = new Set<RoomId>();
    for (const [sibling, roomId] of roomByEntry) {
      if (sibling.block.dayOfWeek === entry.block.dayOfWeek && strictlyOverlaps(sibling.block, entry.block)) {
        taken.add(roomId);
      }
    }
    for (const ref of occupiedByDay.get(entry.block.dayOfWeek) ?? []) {
      if (strictlyOverlaps(ref, entry.block)) taken.add(ref.roomId);
    }
    return taken;
  };

  const drawFreeRoom = (entry: UnroomedBlock): RoomId => {
    const taken = roomsTakenAtSlot(entry);
    const pool = preferredRoomPool(rooms, taken, (roomId) => roomSeatsGroup(seatFit, entry.groupId, roomId));
    return pool[random.nextInt(pool.length)]!;
  };

  // Teacher room continuity (a back-to-back chain reuses the earlier room) is a
  // soft convenience; seat-fit is a hard commit invariant. So the inherited room
  // is kept only when it still seats the later group — otherwise the chain breaks
  // and the block re-draws a fitting room (SOU-272), never previewing an
  // undersized room that would throw GroupOverCapacityError at commit.
  const resolveRoom = (entry: UnroomedBlock): RoomId => {
    const cached = roomByEntry.get(entry);
    if (cached !== undefined) return cached;
    const predecessor = predecessorOf.get(entry) ?? null;
    const inherited = predecessor !== null ? resolveRoom(predecessor) : null;
    const roomId =
      inherited !== null && roomSeatsGroup(seatFit, entry.groupId, inherited)
        ? inherited
        : drawFreeRoom(entry);
    roomByEntry.set(entry, roomId);
    return roomId;
  };

  for (const entry of inStartTimeOrder(blocks)) {
    resolveRoom(entry);
  }
  const roomByBlock = new Map<WeeklyBlock, RoomId>();
  for (const entry of blocks) {
    roomByBlock.set(entry.block, roomByEntry.get(entry)!);
  }
  return roomByBlock;
}

/**
 * Entries in ascending block start order (stable across equal starts). Greedy
 * free-room assignment is only guaranteed to stay within the max number of
 * simultaneously overlapping blocks when intervals are colored earliest-start
 * first — in caller order, a late-starting block processed early can "use up"
 * both rooms of a slot a middle block still needs. Sorting here makes the
 * fallback genuinely mean over-capacity, independent of caller order.
 */
function inStartTimeOrder(blocks: readonly UnroomedBlock[]): readonly UnroomedBlock[] {
  return [...blocks].sort((a, b) => toMinutes(a.block.start) - toMinutes(b.block.start));
}

function groupRefsByDay(
  refs: readonly ScheduledSessionRef[],
): ReadonlyMap<WeekdayIndex, readonly ScheduledSessionRef[]> {
  const byDay = new Map<WeekdayIndex, ScheduledSessionRef[]>();
  for (const ref of refs) {
    const day = byDay.get(ref.dayOfWeek);
    if (day === undefined) byDay.set(ref.dayOfWeek, [ref]);
    else day.push(ref);
  }
  return byDay;
}

/**
 * Finds, for each block, the immediately preceding block that makes it a
 * back-to-back continuation for room-continuity purposes: same teacher, same
 * weekday, and the predecessor's `end` equals this block's `start`. Blocks
 * with no teacher, or that stand alone on their weekday, never link.
 */
function linkBackToBackChains(entries: readonly UnroomedBlock[]): ReadonlyMap<UnroomedBlock, UnroomedBlock> {
  const byTeacherAndDay = new Map<string, UnroomedBlock[]>();
  for (const entry of entries) {
    if (entry.teacherId === null) continue;
    const key = `${entry.teacherId}|${entry.block.dayOfWeek}`;
    const group = byTeacherAndDay.get(key);
    if (group === undefined) byTeacherAndDay.set(key, [entry]);
    else group.push(entry);
  }

  const predecessorOf = new Map<UnroomedBlock, UnroomedBlock>();
  for (const group of byTeacherAndDay.values()) {
    const sorted = [...group].sort((a, b) => toMinutes(a.block.start) - toMinutes(b.block.start));
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1]!;
      const current = sorted[i]!;
      if (previous.block.end === current.block.start) {
        predecessorOf.set(current, previous);
      }
    }
  }
  return predecessorOf;
}

/**
 * The pure auto-session-generator engine (SOU-158). It turns a
 * {@link SessionGeneratorConfig} into one weekly pattern per group, each block
 * paired with an assigned room, honoring a **minimum-gap constraint over an
 * eligible weekday pool** — not a rigid "every N days" interval. The gap is
 * measured circularly around the week (see {@link circularWeekdayGaps}), so a
 * Monday session forces the next no earlier than `minGapDays` later.
 *
 * Room assignment runs in two stages. The per-group day search (SOU-182)
 * rooms each candidate weekday combo on its own via {@link roomBlocksForGroup},
 * so {@link isConflictFree} has a concrete room to detect a double-booking
 * against while it hunts for a clean weekday set. Once every group has committed
 * its combo, one **run-wide** final pass re-rooms every committed block together
 * through a single {@link assignRoomsToBlocks} call: it draws a room at random
 * from `input.rooms` via the injected {@link RandomPort} for each block, with
 * one exception — when the same teacher has two blocks back-to-back on the same
 * weekday *anywhere in the run* (one block's `end` equals another's `start`),
 * the later block reuses the earlier block's room instead of drawing a fresh
 * one, so the teacher never switches rooms between consecutive classes even when
 * those classes belong to different groups. Rooming the whole run together — not
 * group by group — is what lets that continuity chain span groups. Every draw is
 * **collision-aware** (SOU-261): it only picks among rooms free at that block's
 * weekday+time, counting both sibling blocks in this run and the real committed
 * schedule, and falls back to the full pool only when no room is free — a
 * genuine over-capacity slot. The final pass,
 * {@link detectGeneratedScheduleConflicts} (SOU-161), still runs over the
 * re-roomed blocks and reports any remaining clash (fallback draws, chain
 * overrides) for the caller to act on — it never changes the picked room.
 *
 * Randomization runs through the injected {@link RandomPort}, never
 * `Math.random()`, so a seeded fake makes every test deterministic. Each
 * group's weekday pattern is selected independently, spreading groups across
 * different days rather than stacking them all on the same pattern.
 *
 * Scope is deliberately narrow: no persistence, no ids, no writes, and **no
 * holiday check** — a weekly pattern carries no concrete date, so skipping
 * holiday dates only makes sense once a pattern is materialized into dated
 * occurrences ({@link GenerateSessions}). What this engine *does* detect
 * (SOU-161, via {@link detectGeneratedScheduleConflicts}) is a center-hours
 * overrun plus room/teacher double-booking against the real committed schedule
 * or against a sibling proposal in the same run — reported as
 * non-blocking `conflicts`, never thrown. Auto mode additionally **fails fast**
 * (SOU-261) on two configs that cannot fit at all: a session duration no
 * opening window on any pool day can hold (`duration-exceeds-windows`), and a
 * weekly demand beyond the center's one-slot-per-weekday room capacity
 * (`room-capacity-exceeded`).
 */
export class SessionGenerator {
  constructor(private readonly random: RandomPort) {}

  generate(input: SessionGenerationInput): SessionGeneratorResult {
    const { config, groups, centerHours, existingSchedule } = input;
    const windowsByWeekday = this.windowsByWeekday(centerHours);
    const openPool = [...new Set(config.weekdayPool)].filter((day) => windowsByWeekday.has(day));
    if (config.mode === 'auto' && config.sessionsPerWeek < 1) {
      // Before the duration filter, so a config broken in two ways reports the
      // scalar mistake first — the more actionable remediation.
      throw new InfeasibleGeneratorConfigError(
        'non-positive-sessions-per-week',
        openPool,
        config.sessionsPerWeek,
        config.minGapDays,
      );
    }
    const eligiblePool =
      config.mode === 'auto' ? this.poolFittingDuration(openPool, windowsByWeekday, config) : openPool;
    const seatFit = this.seatFitContext(input);
    const availability = this.availabilityContext(input);
    if (config.mode === 'auto') {
      this.assertAutoRoomFeasibility(
        config,
        groups,
        eligiblePool,
        input.rooms,
        seatFit,
        windowsByWeekday,
        input.teacherByGroup,
        availability,
      );
    }
    const context: GroupPlacementContext = {
      windowsByWeekday,
      rooms: input.rooms,
      teacherByGroup: input.teacherByGroup,
      existingSchedule,
      centerHours,
      availability,
      seatFit,
    };

    const committed: GeneratedBlockCandidate[] = [];
    const searched: GroupScheduleProposal[] = [];
    for (const groupId of groups) {
      const proposal =
        config.mode === 'auto'
          ? this.placeAutoGroup(groupId, config, eligiblePool, context, committed)
          : this.placeCustomGroup(groupId, config, context);
      searched.push(proposal);
      for (const scheduled of proposal.blocks) {
        committed.push({
          groupId,
          block: scheduled.block,
          roomId: scheduled.roomId,
          teacherId: scheduled.teacherId,
        });
      }
    }

    const proposals = this.assignRunWideRooms(searched, context);
    const roomedCommitted = proposals.flatMap((proposal) =>
      proposal.blocks.map((scheduled) => ({
        groupId: proposal.groupId,
        block: scheduled.block,
        roomId: scheduled.roomId,
        teacherId: scheduled.teacherId,
      })),
    );
    const conflicts = detectGeneratedScheduleConflicts(
      roomedCommitted,
      existingSchedule,
      centerHours,
      context.availability,
      context.seatFit,
      input.rosterByGroup,
    );
    return { proposals, conflicts };
  }

  /**
   * Folds the caller's per-teacher rules into the detection pass's context
   * (SOU-259): resolves the run's materialization window once per weekday — the
   * `occurrenceCount` range variant ends on a different date per weekday — so
   * the exception check never re-derives dates per candidate. `undefined` when
   * no teacher has anything configured, which skips the check entirely.
   */
  private availabilityContext(input: SessionGenerationInput): GeneratorAvailabilityContext | undefined {
    const rulesByTeacher = input.availabilityByTeacher;
    if (rulesByTeacher === undefined || rulesByTeacher.size === 0) return undefined;
    const rangeByWeekday = new Map<WeekdayIndex, DateRange>(
      WEEKDAYS.map((weekday) => [
        weekday,
        resolveGeneratorMaterializationRange(input.config.range, weekday),
      ]),
    );
    return { rulesByTeacher, rangeByWeekday };
  }

  /**
   * Re-rooms every committed block of the run in one {@link assignRoomsToBlocks}
   * pass, replacing the provisional per-group rooms the day search drew
   * ({@link roomBlocksForGroup}). Rooming the whole run together — rather than
   * group by group — is what lets the same-teacher back-to-back continuity rule
   * span groups: a teacher teaching group A then group B back-to-back on one
   * weekday keeps a single room, which a per-group pass could never see.
   */
  private assignRunWideRooms(
    proposals: readonly GroupScheduleProposal[],
    context: GroupPlacementContext,
  ): readonly GroupScheduleProposal[] {
    const entries: UnroomedBlock[] = proposals.flatMap((proposal) =>
      proposal.blocks.map((scheduled) => ({
        groupId: proposal.groupId,
        teacherId: context.teacherByGroup.get(proposal.groupId) ?? null,
        block: scheduled.block,
      })),
    );
    const roomByBlock = assignRoomsToBlocks(
      entries,
      context.rooms,
      this.random,
      context.existingSchedule,
      context.seatFit,
    );
    return proposals.map((proposal) => ({
      ...proposal,
      blocks: proposal.blocks.map((scheduled) => ({
        block: scheduled.block,
        roomId: roomByBlock.get(scheduled.block)!,
        teacherId: scheduled.teacherId,
      })),
    }));
  }

  /**
   * Drops pool days where no single opening window can hold the session
   * duration (SOU-261 F4): keeping such a day would anchor a block that is
   * guaranteed to overrun closing time. When the filter empties a non-empty
   * pool, the run is infeasible as configured — auto mode throws instead of
   * generating known-broken blocks. Custom mode never runs this: an admin's
   * explicit pick is flagged by the conflicts pass, not blocked.
   */
  private poolFittingDuration(
    openPool: readonly WeekdayIndex[],
    windowsByWeekday: ReadonlyMap<WeekdayIndex, readonly TimeWindow[]>,
    config: SessionGeneratorConfigBase,
  ): readonly WeekdayIndex[] {
    const fitsDuration = (day: WeekdayIndex): boolean =>
      (windowsByWeekday.get(day) ?? []).some(
        (window) => toMinutes(window.close) - toMinutes(window.open) >= config.sessionDurationMinutes,
      );
    const fittingPool = openPool.filter(fitsDuration);
    if (openPool.length > 0 && fittingPool.length === 0) {
      throw new InfeasibleGeneratorConfigError(
        'duration-exceeds-windows',
        openPool,
        config.sessionsPerWeek,
        config.minGapDays,
      );
    }
    return fittingPool;
  }

  /**
   * Fails fast when the run's weekly demand cannot fit the center (SOU-261 F3):
   * every block anchors at one slot per weekday, so the week holds at most
   * `eligibleDays × rooms` blocks and `groups × sessionsPerWeek` beyond that is
   * guaranteed to double-book. Skipped when the per-group pool checks own the
   * diagnosis (empty rooms → {@link NoRoomsConfiguredError}; pool too small or a
   * non-positive weekly count → the more actionable per-group reasons).
   */
  /**
   * Bundles the run's seat capacities into a {@link SeatFit} the room draw reads
   * (SOU-272), or `undefined` when the caller passed neither map — which keeps
   * the seat-blind behavior for callers (and tests) that don't supply capacities.
   */
  private seatFitContext(input: SessionGenerationInput): SeatFit | undefined {
    if (input.roomCapacities === undefined || input.groupCapacities === undefined) return undefined;
    return { roomCapacity: input.roomCapacities, seatsByGroup: input.groupCapacities };
  }

  /**
   * The auto-mode room fail-fast guards, in the order that reports the most
   * actionable reason first: weekly demand beyond one-slot-per-weekday capacity
   * (SOU-261), then a group larger than every room (SOU-272).
   */
  private assertAutoRoomFeasibility(
    config: SessionGeneratorConfigBase,
    groups: readonly GroupId[],
    eligiblePool: readonly WeekdayIndex[],
    rooms: readonly RoomId[],
    seatFit: SeatFit | undefined,
    windowsByWeekday: ReadonlyMap<WeekdayIndex, readonly TimeWindow[]>,
    teacherByGroup: ReadonlyMap<GroupId, EntityId | null>,
    availability: GeneratorAvailabilityContext | undefined,
  ): void {
    this.assertRoomCapacity(config, groups, eligiblePool, rooms, windowsByWeekday, teacherByGroup, availability);
    this.assertGroupsFitSomeRoom(groups, rooms, seatFit);
  }

  /**
   * Fails fast (auto mode) when a scoped group needs more seats than the largest
   * room can hold (SOU-272): no room assignment could ever satisfy the seat-fit
   * invariant {@link GroupOverCapacityError} enforces at commit, so the run is
   * infeasible as configured — surfacing it here on the preview beats a
   * mid-commit crash. Skipped when no seat data was supplied. Custom mode never
   * throws — its clashes are flagged, not blocked.
   */
  private assertGroupsFitSomeRoom(
    groups: readonly GroupId[],
    rooms: readonly RoomId[],
    seatFit: SeatFit | undefined,
  ): void {
    if (seatFit === undefined || rooms.length === 0) return;
    const largestRoom = Math.max(
      ...rooms.map((roomId) => seatFit.roomCapacity.get(roomId) ?? Number.POSITIVE_INFINITY),
    );
    const oversizedGroup = groups.find((groupId) => (seatFit.seatsByGroup.get(groupId) ?? 0) > largestRoom);
    if (oversizedGroup !== undefined) {
      throw new GroupExceedsRoomCapacityError(seatFit.seatsByGroup.get(oversizedGroup)!, largestRoom);
    }
  }

  /**
   * `groups × sessionsPerWeek` is the *nominal* demand, assuming every group
   * gets its full request — no longer a safe proxy for actual demand once a
   * teacher's availability legitimately caps some groups to fewer sessions
   * (SOU-296): nominal demand can exceed capacity while every group's real
   * achievable count still fits. So this sums each group's own achievable cap
   * ({@link maxAchievableSessions}) instead of assuming the uniform nominal
   * count, and only fails fast when even that tighter, still-conservative
   * bound cannot fit.
   */
  private assertRoomCapacity(
    config: SessionGeneratorConfigBase,
    groups: readonly GroupId[],
    eligiblePool: readonly WeekdayIndex[],
    rooms: readonly RoomId[],
    windowsByWeekday: ReadonlyMap<WeekdayIndex, readonly TimeWindow[]>,
    teacherByGroup: ReadonlyMap<GroupId, EntityId | null>,
    availability: GeneratorAvailabilityContext | undefined,
  ): void {
    const perGroupChecksOwnDiagnosis =
      rooms.length === 0 || config.sessionsPerWeek < 1 || config.sessionsPerWeek > eligiblePool.length;
    if (perGroupChecksOwnDiagnosis) return;
    const demand = groups.reduce(
      (total, groupId) =>
        total +
        this.maxAchievableSessions(groupId, config, eligiblePool, windowsByWeekday, teacherByGroup, availability),
      0,
    );
    if (demand > eligiblePool.length * rooms.length) {
      throw new InfeasibleGeneratorConfigError(
        'room-capacity-exceeded',
        eligiblePool,
        config.sessionsPerWeek,
        config.minGapDays,
      );
    }
  }

  /**
   * The most sessions this group could possibly get (SOU-296): `sessionsPerWeek`
   * for a group with no teacher or no configured availability rules (unchanged
   * from before availability existed), or the count of `eligiblePool` days the
   * teacher has *any* available window on, capped at `sessionsPerWeek`,
   * otherwise. Anchors one candidate block per day the same way
   * {@link buildBlocks} does, so a day whose only opening window is too short
   * for the session duration is correctly excluded too. Ignores minGapDays and
   * room/teacher double-booking — both can only tighten the real placement
   * further, never loosen it, so this stays a safe upper bound, not an exact
   * prediction.
   */
  private maxAchievableSessions(
    groupId: GroupId,
    config: SessionGeneratorConfigBase,
    eligiblePool: readonly WeekdayIndex[],
    windowsByWeekday: ReadonlyMap<WeekdayIndex, readonly TimeWindow[]>,
    teacherByGroup: ReadonlyMap<GroupId, EntityId | null>,
    availability: GeneratorAvailabilityContext | undefined,
  ): number {
    const teacherId = teacherByGroup.get(groupId) ?? null;
    const rules = teacherId !== null ? availability?.rulesByTeacher.get(teacherId) : undefined;
    if (rules === undefined) return config.sessionsPerWeek;
    const restrictedWindows = this.availabilityRestrictedWindows(windowsByWeekday, teacherId, availability);
    const availableDays = eligiblePool.filter((day) => {
      const block = weeklyBlockInFittingWindow(day, restrictedWindows.get(day) ?? [], config.sessionDurationMinutes);
      if (block === null) return false;
      const range = availability?.rangeByWeekday.get(day) ?? null;
      return teacherUnavailability(block, teacherId!, rules, range) === null;
    }).length;
    return Math.min(config.sessionsPerWeek, availableDays);
  }

  /**
   * Places one group by searching **every** min-gap-valid weekday combination
   * of the requested size (SOU-182), not just the first: it commits the first
   * combo whose roomed blocks clash with nothing — neither the real committed
   * schedule nor a group already placed earlier in this same run. Failing that,
   * it commits the first combo that is at least clean of teacher-availability
   * conflicts, still surfacing any other clash (room/teacher double-booking) to
   * the caller via {@link detectGeneratedScheduleConflicts} as before. Only when
   * *no* combo at the requested size clears availability does the search retry
   * at smaller sizes (SOU-296) — a teacher free on fewer days than requested
   * yields fewer generated blocks rather than a block placed outside their
   * declared availability; {@link GroupScheduleProposal.requestedSessionsPerWeek}
   * lets the caller detect and surface that shortfall. A true dead end (no
   * availability-clean day exists at any size, down to one) yields zero blocks
   * for the group. The search is greedy across groups (no cross-group
   * backtracking); within a chosen weekday, each block anchors at the
   * earliest slot that both fits the session duration inside the teacher's
   * own availability window (SOU-218) and clears whatever that same teacher
   * already has booked on that weekday earlier in this run — so two groups
   * sharing a teacher on the same day pack back-to-back instead of colliding
   * on the same anchor time.
   */
  private placeAutoGroup(
    groupId: GroupId,
    config: SessionGeneratorConfigBase,
    eligiblePool: readonly WeekdayIndex[],
    context: GroupPlacementContext,
    committed: readonly GeneratedBlockCandidate[],
  ): GroupScheduleProposal {
    const requested = config.sessionsPerWeek;
    const occupied = [...context.existingSchedule, ...committed.map(generatedCandidateToScheduledRef)];

    const committedForTeacher = committed.map(generatedCandidateToScheduledRef);

    const bestAtSize = (
      combinations: readonly (readonly WeekdayIndex[])[],
    ): readonly ScheduledBlockProposal[] | undefined => {
      let firstAvailabilityFree: readonly ScheduledBlockProposal[] | undefined;
      for (const weekdays of combinations) {
        const blocks = this.roomBlocksForGroup(groupId, weekdays, config, context, occupied, committedForTeacher, true);
        // A day whose intersected availability window dropped out of `blocks`
        // makes this combo a partial match, not a real candidate at this size —
        // the shrink-retry loop below is what handles "fewer days than asked
        // for", never a silently-incomplete combo trivially passing because it
        // has nothing left to conflict.
        if (blocks.length < weekdays.length) continue;
        const conflicts = this.conflictsFor(groupId, blocks, context, committed);
        if (conflicts.length === 0) return blocks;
        if (
          firstAvailabilityFree === undefined &&
          conflicts.every((conflict) => conflict.kind !== 'teacher-availability')
        ) {
          firstAvailabilityFree = blocks;
        }
      }
      return firstAvailabilityFree;
    };

    const atRequestedSize = bestAtSize(this.feasibleCombinations(eligiblePool, requested, config.minGapDays));
    if (atRequestedSize !== undefined) {
      return { groupId, blocks: atRequestedSize, gapViolations: [], requestedSessionsPerWeek: requested, shortfallReason: null };
    }

    for (let size = requested - 1; size >= 1; size -= 1) {
      const combinations = this.minGapCombinations(this.shuffle(eligiblePool), size, config.minGapDays);
      if (combinations.length === 0) continue;
      const blocks = bestAtSize(combinations);
      if (blocks !== undefined) {
        return {
          groupId,
          blocks,
          gapViolations: [],
          requestedSessionsPerWeek: requested,
          shortfallReason: this.shortfallReason(groupId, requested, blocks.length, config, eligiblePool, context),
        };
      }
    }

    return {
      groupId,
      blocks: [],
      gapViolations: [],
      requestedSessionsPerWeek: requested,
      shortfallReason: this.shortfallReason(groupId, requested, 0, config, eligiblePool, context),
    };
  }

  /**
   * Distinguishes why an auto-mode placement fell short of `requested` (SOU-296):
   * `'teacher-availability'` when the teacher genuinely doesn't have enough
   * usable days at all — {@link maxAchievableSessions} (which ignores
   * `minGapDays` and is a safe upper bound) is itself below `requested` — versus
   * `'min-gap'` when enough usable days exist but no subset of them spaced
   * `minGapDays` apart could be found, so the spacing rule alone capped the
   * count. The two need different remediation (declare more availability vs
   * loosen the spacing / accept fewer sessions), so the caller must not collapse
   * them into one generic message.
   */
  private shortfallReason(
    groupId: GroupId,
    requested: number,
    achieved: number,
    config: SessionGeneratorConfigBase,
    eligiblePool: readonly WeekdayIndex[],
    context: GroupPlacementContext,
  ): 'teacher-availability' | 'min-gap' | null {
    if (achieved >= requested) return null;
    const achievableDays = this.maxAchievableSessions(
      groupId,
      config,
      eligiblePool,
      context.windowsByWeekday,
      context.teacherByGroup,
      context.availability,
    );
    return achievableDays < requested ? 'teacher-availability' : 'min-gap';
  }

  private placeCustomGroup(
    groupId: GroupId,
    config: SessionGeneratorConfigBase & { readonly pickedWeekdays: readonly WeekdayIndex[] },
    context: GroupPlacementContext,
  ): GroupScheduleProposal {
    return {
      groupId,
      blocks: this.roomBlocksForGroup(groupId, config.pickedWeekdays, config, context, context.existingSchedule, [], false),
      gapViolations: gapViolations(config.pickedWeekdays, config.minGapDays),
      requestedSessionsPerWeek: config.pickedWeekdays.length,
      shortfallReason: null,
    };
  }

  /**
   * Builds the group's weekly blocks for `weekdays` and gives each a
   * *provisional* room via {@link assignRoomsToBlocks}, keyed back by block
   * identity — a `WeeklyBlock` object is unique per generated occurrence, so it
   * doubles as the map key. These rooms exist only so the per-group day search
   * ({@link conflictsFor}) has a concrete room to detect a double-booking
   * against; {@link generate}'s run-wide final pass ({@link assignRunWideRooms})
   * re-rooms every committed block together, so this per-group draw never
   * survives into the result.
   *
   * Auto mode only (`restrictToAvailability`): the candidate windows are first
   * restricted to the group's own teacher's declared availability
   * ({@link availabilityRestrictedWindows}), and the anchor search skips over
   * whatever that same teacher already has booked on a given weekday earlier
   * in this same auto run (`placementOccupied`, via
   * {@link teacherOccupiedByDay}) — so a second auto-placed group sharing a
   * teacher on the only open day lands right after the first group's block
   * instead of anchoring on top of it. Custom mode passes `false` and an empty
   * `placementOccupied`: an admin's explicit weekday pick is never silently
   * repositioned or dropped, only flagged by the conflicts pass, exactly as
   * before (SOU-183). Either way `occupied` (existing schedule plus every
   * block committed so far this run, regardless of teacher) still drives room
   * drawing unchanged.
   */
  private roomBlocksForGroup(
    groupId: GroupId,
    weekdays: readonly WeekdayIndex[],
    config: SessionGeneratorConfigBase,
    context: GroupPlacementContext,
    occupied: readonly ScheduledSessionRef[],
    placementOccupied: readonly ScheduledSessionRef[],
    restrictToAvailability: boolean,
  ): readonly ScheduledBlockProposal[] {
    const teacherId = context.teacherByGroup.get(groupId) ?? null;
    const windowsByWeekday = restrictToAvailability
      ? this.availabilityRestrictedWindows(context.windowsByWeekday, teacherId, context.availability)
      : context.windowsByWeekday;
    const occupiedByDay = this.teacherOccupiedByDay(placementOccupied, teacherId);
    const blocks = this.buildBlocks(weekdays, windowsByWeekday, config.sessionDurationMinutes, occupiedByDay);
    const entries: UnroomedBlock[] = blocks.map((block) => ({ groupId, teacherId, block }));
    const roomByBlock = assignRoomsToBlocks(entries, context.rooms, this.random, occupied, context.seatFit);
    return blocks.map((block) => ({ block, roomId: roomByBlock.get(block)!, teacherId }));
  }

  /**
   * `windowsByWeekday` narrowed to the span the given teacher actually
   * declared as available, per weekday (SOU-259 weekly windows intersected
   * with SOU-261 center hours). A day whose intersection is empty carries no
   * candidate block for this teacher, matching {@link maxAchievableSessions}'s
   * accounting — {@link SessionGenerator} never places a block outside a
   * teacher's declared weekly availability. No teacher, or a teacher with no
   * weekly pattern configured (only one-off exceptions, or nothing at all),
   * passes `windowsByWeekday` through unchanged.
   */
  private availabilityRestrictedWindows(
    windowsByWeekday: ReadonlyMap<WeekdayIndex, readonly TimeWindow[]>,
    teacherId: EntityId | null,
    availability: GeneratorAvailabilityContext | undefined,
  ): ReadonlyMap<WeekdayIndex, readonly TimeWindow[]> {
    const rules = teacherId !== null ? availability?.rulesByTeacher.get(teacherId) : undefined;
    if (rules?.weeklyWindows == null) return windowsByWeekday;
    const restricted = new Map<WeekdayIndex, readonly TimeWindow[]>();
    for (const [day, windows] of windowsByWeekday) {
      restricted.set(day, intersectTimeWindows(windows, rules.weeklyWindows[day]));
    }
    return restricted;
  }

  /**
   * `occupied`, narrowed to the given teacher's own blocks and grouped by
   * weekday as plain `TimeWindow`s — exactly the shape
   * {@link weeklyBlockInFittingWindow}'s occupied-slot search reads. A teacherless
   * group has nothing to avoid (an empty map skips the search's occupied-aware
   * branch on every day, matching pre-existing behavior).
   */
  private teacherOccupiedByDay(
    occupied: readonly ScheduledSessionRef[],
    teacherId: EntityId | null,
  ): ReadonlyMap<WeekdayIndex, readonly TimeWindow[]> {
    const byDay = new Map<WeekdayIndex, TimeWindow[]>();
    if (teacherId === null) return byDay;
    for (const ref of occupied) {
      if (ref.teacherId !== teacherId) continue;
      const window: TimeWindow = { open: ref.start, close: ref.end };
      const existing = byDay.get(ref.dayOfWeek);
      if (existing === undefined) byDay.set(ref.dayOfWeek, [window]);
      else existing.push(window);
    }
    return byDay;
  }

  /**
   * This group's roomed blocks checked against the real committed schedule
   * plus every group already placed in this run (widened to
   * {@link ScheduledSessionRef} so the checks treat them like persisted
   * sessions). `bestAtSize` reads this once per candidate combo and derives
   * both "fully clean" and "clean of `teacher-availability`" from the same
   * result, rather than recomputing conflicts per predicate.
   */
  private conflictsFor(
    groupId: GroupId,
    blocks: readonly ScheduledBlockProposal[],
    context: GroupPlacementContext,
    committed: readonly GeneratedBlockCandidate[],
  ): readonly GeneratedScheduleConflict[] {
    const candidates: GeneratedBlockCandidate[] = blocks.map((scheduled) => ({
      groupId,
      block: scheduled.block,
      roomId: scheduled.roomId,
      teacherId: scheduled.teacherId,
    }));
    const priorRuns = committed.map(generatedCandidateToScheduledRef);
    return detectGeneratedScheduleConflicts(
      candidates,
      [...context.existingSchedule, ...priorRuns],
      context.centerHours,
      context.availability,
    );
  }

  private feasibleCombinations(
    eligiblePool: readonly WeekdayIndex[],
    sessionsPerWeek: number,
    minGapDays: number,
  ): readonly (readonly WeekdayIndex[])[] {
    if (sessionsPerWeek < 1) {
      throw new InfeasibleGeneratorConfigError('non-positive-sessions-per-week', eligiblePool, sessionsPerWeek, minGapDays);
    }
    if (sessionsPerWeek > eligiblePool.length) {
      throw new InfeasibleGeneratorConfigError('pool-smaller-than-sessions', eligiblePool, sessionsPerWeek, minGapDays);
    }
    const combinations = this.minGapCombinations(this.shuffle(eligiblePool), sessionsPerWeek, minGapDays);
    if (combinations.length === 0) {
      throw new InfeasibleGeneratorConfigError('gap-unsatisfiable', eligiblePool, sessionsPerWeek, minGapDays);
    }
    return combinations;
  }

  /**
   * Every size-`size` subset of `pool` that honors `minGapDays`, in the pool's
   * (already shuffled) depth-first order — so the caller's "first" is stable for
   * a given seed. Same enumeration the old single-shot search walked; it now
   * yields all matches instead of stopping at the first.
   */
  private minGapCombinations(
    pool: readonly WeekdayIndex[],
    size: number,
    minGapDays: number,
  ): readonly (readonly WeekdayIndex[])[] {
    const combinations: (readonly WeekdayIndex[])[] = [];
    const current: WeekdayIndex[] = [];
    const search = (start: number): void => {
      if (current.length === size) {
        if (satisfiesMinGap(current, minGapDays)) combinations.push([...current]);
        return;
      }
      for (let i = start; i < pool.length; i += 1) {
        const day = pool[i];
        if (day === undefined) continue;
        current.push(day);
        search(i + 1);
        current.pop();
      }
    };
    search(0);
    return combinations;
  }

  private shuffle(items: readonly WeekdayIndex[]): readonly WeekdayIndex[] {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = this.random.nextInt(i + 1);
      const left = shuffled[i];
      const right = shuffled[j];
      if (left === undefined || right === undefined) continue;
      shuffled[i] = right;
      shuffled[j] = left;
    }
    return shuffled;
  }

  private buildBlocks(
    weekdays: readonly WeekdayIndex[],
    windowsByWeekday: ReadonlyMap<WeekdayIndex, readonly TimeWindow[]>,
    durationMinutes: number,
    occupiedByDay: ReadonlyMap<WeekdayIndex, readonly TimeWindow[]>,
  ): readonly WeeklyBlock[] {
    const blocks: WeeklyBlock[] = [];
    for (const day of [...new Set(weekdays)].sort((a, b) => a - b)) {
      const windows = windowsByWeekday.get(day) ?? [];
      const occupied = occupiedByDay.get(day) ?? [];
      const block = weeklyBlockInFittingWindow(day, windows, durationMinutes, occupied);
      if (block !== null) blocks.push(block); // a closed weekday, or a day the teacher has no availability window on, carries no session
    }
    return blocks;
  }

  private windowsByWeekday(centerHours: readonly DayHours[]): ReadonlyMap<WeekdayIndex, readonly TimeWindow[]> {
    const windowsByWeekday = new Map<WeekdayIndex, readonly TimeWindow[]>();
    for (const day of centerHours) {
      if (day.windows.length > 0) windowsByWeekday.set(day.dayOfWeek, day.windows);
    }
    return windowsByWeekday;
  }
}
