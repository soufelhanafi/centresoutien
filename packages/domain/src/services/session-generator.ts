import type { RandomPort } from '../ports/random-port';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { GroupId, GroupKind } from '../entities/group';
import type { TeacherId } from '../entities/teacher';
import type { DayHours } from '../policies/session-conflict-policy';
import { weeklyBlockFromOpen, type WeeklyBlock } from '../value-objects/weekly-block';
import { gapViolations, satisfiesMinGap, type WeekdayGap } from '../policies/weekday-gap';
import { InfeasibleGeneratorConfigError } from '../errors/session-generator-errors';

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

/** One group's proposed weekly pattern plus any gap breaches (always empty in auto mode). */
export type GroupScheduleProposal = {
  readonly groupId: GroupId;
  readonly blocks: readonly WeeklyBlock[];
  readonly gapViolations: readonly WeekdayGap[];
};

export type SessionGeneratorResult = {
  readonly proposals: readonly GroupScheduleProposal[];
};

/**
 * The scope-resolved inputs a run needs: the config, the concrete `groups` the
 * caller expanded from `config.scope` (resolving `'all'` needs a repository —
 * out of this pure engine), and the center's opening hours per weekday.
 */
export type SessionGenerationInput = {
  readonly config: SessionGeneratorConfig;
  readonly groups: readonly GroupId[];
  readonly centerHours: readonly DayHours[];
};

/**
 * The pure auto-session-generator engine (SOU-158). It turns a
 * {@link SessionGeneratorConfig} into one {@link WeeklyBlock} pattern per group,
 * honoring a **minimum-gap constraint over an eligible weekday pool** — not a
 * rigid "every N days" interval. The gap is measured circularly around the week
 * (see {@link circularWeekdayGaps}), so a Monday session forces the next no
 * earlier than `minGapDays` later.
 *
 * Randomization runs through the injected {@link RandomPort}, never
 * `Math.random()`, so a seeded fake makes every test deterministic. Each group
 * is selected independently, spreading groups across different days rather than
 * stacking them all on the same pattern.
 *
 * Scope is deliberately narrow (KICKOFF): no persistence, no ids, no writes, and
 * **no room-conflict or holiday checks** — those are SOU-161. It reads center
 * hours only to place each block's start at the day's opening time and to drop
 * weekdays the center is closed on; a block that would overrun closing time is
 * SOU-161's concern, not this engine's.
 */
export class SessionGenerator {
  constructor(private readonly random: RandomPort) {}

  generate(input: SessionGenerationInput): SessionGeneratorResult {
    const { config, groups, centerHours } = input;
    const openByWeekday = this.openTimeByWeekday(centerHours);
    const eligiblePool = [...new Set(config.weekdayPool)].filter((day) => openByWeekday.has(day));

    const proposals = groups.map((groupId) =>
      config.mode === 'auto'
        ? this.autoProposal(groupId, config, eligiblePool, openByWeekday)
        : this.customProposal(groupId, config, openByWeekday),
    );
    return { proposals };
  }

  private autoProposal(
    groupId: GroupId,
    config: SessionGeneratorConfigBase,
    eligiblePool: readonly WeekdayIndex[],
    openByWeekday: ReadonlyMap<WeekdayIndex, TimeOfDay>,
  ): GroupScheduleProposal {
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
  ): GroupScheduleProposal {
    return {
      groupId,
      blocks: this.buildBlocks(config.pickedWeekdays, openByWeekday, config.sessionDurationMinutes),
      gapViolations: gapViolations(config.pickedWeekdays, config.minGapDays),
    };
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
