import type { RandomPort } from '../ports/random-port';
import type { WeekdayIndex } from '../value-objects/weekday';
import { toMinutes, type TimeOfDay } from '../value-objects/time-of-day';
import type { EntityId } from '../value-objects/ids';
import type { GroupId, GroupKind } from '../entities/group';
import type { TeacherId } from '../entities/teacher';
import type { RoomId } from '../entities/room';
import type { ScheduledSessionRef } from '../errors/scheduling-errors';
import type { DayHours } from '../policies/session-conflict-policy';
import { weeklyBlockFromOpen, type WeeklyBlock } from '../value-objects/weekly-block';
import { gapViolations, satisfiesMinGap, type WeekdayGap } from '../policies/weekday-gap';
import { endDateAfterWeekdayOccurrences, type DateRange } from '../value-objects/date-range';
import {
  detectGeneratedScheduleConflicts,
  type GeneratedScheduleConflict,
} from '../policies/generated-schedule-conflicts';
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

/** A block awaiting a room, still tagged with the group and teacher it belongs to. */
type UnroomedProposal = {
  readonly groupId: GroupId;
  readonly blocks: readonly WeeklyBlock[];
  readonly gapViolations: readonly WeekdayGap[];
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
 * Assigns a room to every entry in `blocks`, in list order, drawing from
 * `rooms` via `random` — except when the same teacher already has another
 * entry in this same list back-to-back on the same weekday (one block's `end`
 * equals another's `start`), in which case the later block reuses the earlier
 * one's room rather than drawing a fresh one. Chains longer than two blocks
 * propagate the same room through every link. This reasoning is intra-batch
 * only: `blocks` is the full set generated in one run, nothing outside it is
 * consulted. Throws {@link NoRoomsConfiguredError} when `blocks` is non-empty
 * and `rooms` is empty — every generated block needs a room.
 */
export function assignRoomsToBlocks(
  blocks: readonly UnroomedBlock[],
  rooms: readonly RoomId[],
  random: RandomPort,
): ReadonlyMap<WeeklyBlock, RoomId> {
  if (blocks.length === 0) return new Map();
  if (rooms.length === 0) throw new NoRoomsConfiguredError();

  const predecessorOf = linkBackToBackChains(blocks);
  const roomByEntry = new Map<UnroomedBlock, RoomId>();
  const resolveRoom = (entry: UnroomedBlock): RoomId => {
    const cached = roomByEntry.get(entry);
    if (cached !== undefined) return cached;
    const predecessor = predecessorOf.get(entry) ?? null;
    const roomId = predecessor !== null ? resolveRoom(predecessor) : rooms[random.nextInt(rooms.length)]!;
    roomByEntry.set(entry, roomId);
    return roomId;
  };

  const roomByBlock = new Map<WeeklyBlock, RoomId>();
  for (const entry of blocks) {
    roomByBlock.set(entry.block, resolveRoom(entry));
  }
  return roomByBlock;
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
 * Room assignment (SOU-158, not SOU-161) picks a room at random from
 * `input.rooms` via the injected {@link RandomPort} for every generated block,
 * with one exception: when the same teacher has two blocks back-to-back on the
 * same weekday within this same run (one block's `end` equals another's
 * `start`), the later block reuses the earlier block's room instead of
 * drawing a fresh one, so the teacher never has to switch rooms between
 * consecutive classes. This reasoning is **intra-batch only** — it never reads
 * the real, already-committed schedule; a room draw here can still land on
 * one already occupied by an existing session or by another group's proposal
 * in this same run. Catching that is a separate pass, {@link
 * detectGeneratedScheduleConflicts} (SOU-161) — it never changes the picked
 * room, only reports the clash for the caller to act on.
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
 * non-blocking `conflicts`, never thrown.
 */
export class SessionGenerator {
  constructor(private readonly random: RandomPort) {}

  generate(input: SessionGenerationInput): SessionGeneratorResult {
    const { config, groups, teacherByGroup, rooms, centerHours, existingSchedule } = input;
    const openByWeekday = this.openTimeByWeekday(centerHours);
    const eligiblePool = [...new Set(config.weekdayPool)].filter((day) => openByWeekday.has(day));

    const unroomed = groups.map((groupId) =>
      config.mode === 'auto'
        ? this.autoProposal(groupId, config, eligiblePool, openByWeekday)
        : this.customProposal(groupId, config, openByWeekday),
    );

    const roomByBlock = this.assignRooms(unroomed, teacherByGroup, rooms);
    const proposals = unroomed.map((proposal) => ({
      groupId: proposal.groupId,
      blocks: proposal.blocks.map((block) => ({
        block,
        roomId: roomByBlock.get(block)!,
        teacherId: teacherByGroup.get(proposal.groupId) ?? null,
      })),
      gapViolations: proposal.gapViolations,
    }));

    const candidates = proposals.flatMap((proposal) =>
      proposal.blocks.map((scheduled) => ({
        groupId: proposal.groupId,
        block: scheduled.block,
        roomId: scheduled.roomId,
        teacherId: scheduled.teacherId,
      })),
    );
    const conflicts = detectGeneratedScheduleConflicts(candidates, existingSchedule, centerHours);

    return { proposals, conflicts };
  }

  private autoProposal(
    groupId: GroupId,
    config: SessionGeneratorConfigBase,
    eligiblePool: readonly WeekdayIndex[],
    openByWeekday: ReadonlyMap<WeekdayIndex, TimeOfDay>,
  ): UnroomedProposal {
    const weekdays = this.selectWeekdays(eligiblePool, config.sessionsPerWeek, config.minGapDays);
    return {
      groupId,
      blocks: this.buildBlocks(weekdays, openByWeekday, config.sessionDurationMinutes),
      gapViolations: [],
    };
  }

  private customProposal(
    groupId: GroupId,
    config: SessionGeneratorConfigBase & { readonly pickedWeekdays: readonly WeekdayIndex[] },
    openByWeekday: ReadonlyMap<WeekdayIndex, TimeOfDay>,
  ): UnroomedProposal {
    return {
      groupId,
      blocks: this.buildBlocks(config.pickedWeekdays, openByWeekday, config.sessionDurationMinutes),
      gapViolations: gapViolations(config.pickedWeekdays, config.minGapDays),
    };
  }

  /**
   * Flattens every proposal's blocks into {@link UnroomedBlock} entries (each
   * tagged with its group's teacher) and hands them to
   * {@link assignRoomsToBlocks}, keyed back by block identity (a `WeeklyBlock`
   * object is unique per generated occurrence, so it doubles as the map key).
   */
  private assignRooms(
    proposals: readonly UnroomedProposal[],
    teacherByGroup: ReadonlyMap<GroupId, EntityId | null>,
    rooms: readonly RoomId[],
  ): ReadonlyMap<WeeklyBlock, RoomId> {
    const entries: UnroomedBlock[] = [];
    for (const proposal of proposals) {
      for (const block of proposal.blocks) {
        entries.push({ groupId: proposal.groupId, teacherId: teacherByGroup.get(proposal.groupId) ?? null, block });
      }
    }
    return assignRoomsToBlocks(entries, rooms, this.random);
  }

  private selectWeekdays(
    eligiblePool: readonly WeekdayIndex[],
    sessionsPerWeek: number,
    minGapDays: number,
  ): readonly WeekdayIndex[] {
    if (sessionsPerWeek < 1) {
      throw new InfeasibleGeneratorConfigError('non-positive-sessions-per-week', eligiblePool, sessionsPerWeek, minGapDays);
    }
    if (sessionsPerWeek > eligiblePool.length) {
      throw new InfeasibleGeneratorConfigError('pool-smaller-than-sessions', eligiblePool, sessionsPerWeek, minGapDays);
    }
    const found = this.firstFeasibleCombination(this.shuffle(eligiblePool), sessionsPerWeek, minGapDays);
    if (found === null) {
      throw new InfeasibleGeneratorConfigError('gap-unsatisfiable', eligiblePool, sessionsPerWeek, minGapDays);
    }
    return [...found].sort((a, b) => a - b);
  }

  private firstFeasibleCombination(
    pool: readonly WeekdayIndex[],
    size: number,
    minGapDays: number,
  ): readonly WeekdayIndex[] | null {
    const combination: WeekdayIndex[] = [];
    const search = (start: number): readonly WeekdayIndex[] | null => {
      if (combination.length === size) {
        return satisfiesMinGap(combination, minGapDays) ? [...combination] : null;
      }
      for (let i = start; i < pool.length; i += 1) {
        const day = pool[i];
        if (day === undefined) continue;
        combination.push(day);
        const result = search(i + 1);
        combination.pop();
        if (result !== null) return result;
      }
      return null;
    };
    return search(0);
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
    openByWeekday: ReadonlyMap<WeekdayIndex, TimeOfDay>,
    durationMinutes: number,
  ): readonly WeeklyBlock[] {
    const blocks: WeeklyBlock[] = [];
    for (const day of [...new Set(weekdays)].sort((a, b) => a - b)) {
      const open = openByWeekday.get(day);
      if (open === undefined) continue; // a closed weekday carries no session
      blocks.push(weeklyBlockFromOpen(day, open, durationMinutes));
    }
    return blocks;
  }

  private openTimeByWeekday(centerHours: readonly DayHours[]): ReadonlyMap<WeekdayIndex, TimeOfDay> {
    const openByWeekday = new Map<WeekdayIndex, TimeOfDay>();
    for (const day of centerHours) {
      if (day.open !== null) openByWeekday.set(day.dayOfWeek, day.open);
    }
    return openByWeekday;
  }
}
