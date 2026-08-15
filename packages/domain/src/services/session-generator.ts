import type { RandomPort } from '../ports/random-port';
import type { WeekdayIndex } from '../value-objects/weekday';
import { toMinutes } from '../value-objects/time-of-day';
import type { TimeWindow } from '../value-objects/time-window';
import type { EntityId } from '../value-objects/ids';
import type { GroupId, GroupKind } from '../entities/group';
import type { TeacherId } from '../entities/teacher';
import type { RoomId } from '../entities/room';
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
} from '../policies/generated-schedule-conflicts';
import type { TeacherAvailabilityRules } from '../policies/teacher-availability-policy';
import { WEEKDAYS } from '../value-objects/weekday';
import { InfeasibleGeneratorConfigError, NoRoomsConfiguredError } from '../errors/session-generator-errors';

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

/** One group's proposed weekly pattern plus any gap breaches (always empty in auto mode). */
export type GroupScheduleProposal = {
  readonly groupId: GroupId;
  readonly blocks: readonly ScheduledBlockProposal[];
  readonly gapViolations: readonly WeekdayGap[];
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
    const free = rooms.filter((roomId) => !taken.has(roomId));
    const pool = free.length > 0 ? free : rooms;
    return pool[random.nextInt(pool.length)]!;
  };

  const resolveRoom = (entry: UnroomedBlock): RoomId => {
    const cached = roomByEntry.get(entry);
    if (cached !== undefined) return cached;
    const predecessor = predecessorOf.get(entry) ?? null;
    const roomId = predecessor !== null ? resolveRoom(predecessor) : drawFreeRoom(entry);
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
    if (config.mode === 'auto') this.assertRoomCapacity(config, groups, eligiblePool, input.rooms);
    const context: GroupPlacementContext = {
      windowsByWeekday,
      rooms: input.rooms,
      teacherByGroup: input.teacherByGroup,
      existingSchedule,
      centerHours,
      availability: this.availabilityContext(input),
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
    const roomByBlock = assignRoomsToBlocks(entries, context.rooms, this.random, context.existingSchedule);
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
  private assertRoomCapacity(
    config: SessionGeneratorConfigBase,
    groups: readonly GroupId[],
    eligiblePool: readonly WeekdayIndex[],
    rooms: readonly RoomId[],
  ): void {
    const perGroupChecksOwnDiagnosis =
      rooms.length === 0 || config.sessionsPerWeek < 1 || config.sessionsPerWeek > eligiblePool.length;
    if (perGroupChecksOwnDiagnosis) return;
    if (groups.length * config.sessionsPerWeek > eligiblePool.length * rooms.length) {
      throw new InfeasibleGeneratorConfigError(
        'room-capacity-exceeded',
        eligiblePool,
        config.sessionsPerWeek,
        config.minGapDays,
      );
    }
  }

  /**
   * Places one group by searching **every** min-gap-valid weekday combination
   * (SOU-182), not just the first: it commits the first combo whose roomed
   * blocks clash with nothing — neither the real committed schedule nor a group
   * already placed earlier in this same run. Only a true dead-end, where no
   * valid combo is conflict-free, falls back to the first valid combo and lets
   * {@link detectGeneratedScheduleConflicts} surface the clash to the caller.
   * The search is greedy across groups (no cross-group backtracking) and day-only
   * — each block still anchors at the earliest window of its weekday that fits the
   * session duration (SOU-218), never varying the time within a chosen day.
   */
  private placeAutoGroup(
    groupId: GroupId,
    config: SessionGeneratorConfigBase,
    eligiblePool: readonly WeekdayIndex[],
    context: GroupPlacementContext,
    committed: readonly GeneratedBlockCandidate[],
  ): GroupScheduleProposal {
    const combinations = this.feasibleCombinations(eligiblePool, config.sessionsPerWeek, config.minGapDays);
    const occupied = [...context.existingSchedule, ...committed.map(generatedCandidateToScheduledRef)];
    let firstCommittable: readonly ScheduledBlockProposal[] | undefined;
    for (const weekdays of combinations) {
      const blocks = this.roomBlocksForGroup(groupId, weekdays, config, context, occupied);
      firstCommittable ??= blocks;
      if (this.isConflictFree(groupId, blocks, context, committed)) {
        return { groupId, blocks, gapViolations: [] };
      }
    }
    return { groupId, blocks: firstCommittable!, gapViolations: [] };
  }

  private placeCustomGroup(
    groupId: GroupId,
    config: SessionGeneratorConfigBase & { readonly pickedWeekdays: readonly WeekdayIndex[] },
    context: GroupPlacementContext,
  ): GroupScheduleProposal {
    return {
      groupId,
      blocks: this.roomBlocksForGroup(groupId, config.pickedWeekdays, config, context, context.existingSchedule),
      gapViolations: gapViolations(config.pickedWeekdays, config.minGapDays),
    };
  }

  /**
   * Builds the group's weekly blocks for `weekdays` and gives each a
   * *provisional* room via {@link assignRoomsToBlocks}, keyed back by block
   * identity — a `WeeklyBlock` object is unique per generated occurrence, so it
   * doubles as the map key. These rooms exist only so the per-group day search
   * ({@link isConflictFree}) has a concrete room to detect a double-booking
   * against; {@link generate}'s run-wide final pass ({@link assignRunWideRooms})
   * re-rooms every committed block together, so this per-group draw never
   * survives into the result.
   */
  private roomBlocksForGroup(
    groupId: GroupId,
    weekdays: readonly WeekdayIndex[],
    config: SessionGeneratorConfigBase,
    context: GroupPlacementContext,
    occupied: readonly ScheduledSessionRef[],
  ): readonly ScheduledBlockProposal[] {
    const blocks = this.buildBlocks(weekdays, context.windowsByWeekday, config.sessionDurationMinutes);
    const teacherId = context.teacherByGroup.get(groupId) ?? null;
    const entries: UnroomedBlock[] = blocks.map((block) => ({ groupId, teacherId, block }));
    const roomByBlock = assignRoomsToBlocks(entries, context.rooms, this.random, occupied);
    return blocks.map((block) => ({ block, roomId: roomByBlock.get(block)!, teacherId }));
  }

  /**
   * True when this group's roomed blocks clash with nothing the caller supplied:
   * the real committed schedule plus every group already placed in this run
   * (widened to {@link ScheduledSessionRef} so the checks treat them like
   * persisted sessions). Reuses {@link detectGeneratedScheduleConflicts} so the
   * search avoids exactly the clashes the run would otherwise report.
   */
  private isConflictFree(
    groupId: GroupId,
    blocks: readonly ScheduledBlockProposal[],
    context: GroupPlacementContext,
    committed: readonly GeneratedBlockCandidate[],
  ): boolean {
    const candidates: GeneratedBlockCandidate[] = blocks.map((scheduled) => ({
      groupId,
      block: scheduled.block,
      roomId: scheduled.roomId,
      teacherId: scheduled.teacherId,
    }));
    const priorRuns = committed.map(generatedCandidateToScheduledRef);
    const conflicts = detectGeneratedScheduleConflicts(
      candidates,
      [...context.existingSchedule, ...priorRuns],
      context.centerHours,
      context.availability,
    );
    return conflicts.length === 0;
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
  ): readonly WeeklyBlock[] {
    const blocks: WeeklyBlock[] = [];
    for (const day of [...new Set(weekdays)].sort((a, b) => a - b)) {
      const windows = windowsByWeekday.get(day) ?? [];
      const block = weeklyBlockInFittingWindow(day, windows, durationMinutes);
      if (block !== null) blocks.push(block); // a closed weekday carries no session
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
