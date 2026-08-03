import { describe, it, expect } from 'vitest';
import {
  SessionGenerator,
  type SessionGeneratorConfig,
  type SessionGenerationInput,
} from '../../../src/services/session-generator';
import { InfeasibleGeneratorConfigError } from '../../../src/errors/session-generator-errors';
import { satisfiesMinGap } from '../../../src/policies/weekday-gap';
import type { DayHours } from '../../../src/policies/session-conflict-policy';
import type { GroupId, GroupKind } from '../../../src/entities/group';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import { fakeRandom, seededRandom } from '../fakes/random';

const SUN = 0 as WeekdayIndex;
const MON = 1 as WeekdayIndex;
const TUE = 2 as WeekdayIndex;
const WED = 3 as WeekdayIndex;
const THU = 4 as WeekdayIndex;
const FRI = 5 as WeekdayIndex;
const SAT = 6 as WeekdayIndex;

const G1 = 'grp_00000000000000000000000001' as GroupId;
const G2 = 'grp_00000000000000000000000002' as GroupId;

/** Center open 09:00–18:00 Mon–Sat; Sunday closed. Override any day via `over`. */
function centerHours(over: Partial<Record<WeekdayIndex, DayHours>> = {}): readonly DayHours[] {
  const openWeek: WeekdayIndex[] = [MON, TUE, WED, THU, FRI, SAT];
  const week: DayHours[] = [
    { dayOfWeek: SUN, open: null, close: null },
    ...openWeek.map((dayOfWeek) => ({
      dayOfWeek,
      open: '09:00' as TimeOfDay,
      close: '18:00' as TimeOfDay,
    })),
  ];
  return week.map((day) => over[day.dayOfWeek] ?? day);
}

function autoConfig(over: Partial<SessionGeneratorConfig> = {}): SessionGeneratorConfig {
  return {
    scope: { groups: 'all', teachers: 'all' },
    kind: 'regular',
    weekdayPool: [MON, TUE, WED, THU, FRI],
    sessionsPerWeek: 2,
    minGapDays: 2,
    sessionDurationMinutes: 90,
    range: { startDate: '2026-09-01', endDate: '2026-12-31' },
    mode: 'auto',
    ...over,
  } as SessionGeneratorConfig;
}

function input(config: SessionGeneratorConfig, groups: readonly GroupId[], hours = centerHours()): SessionGenerationInput {
  return { config, groups, centerHours: hours };
}

describe('SessionGenerator — auto mode', () => {
  it('proposes a gap-honoring weekly pattern with center-hours placement', () => {
    const generator = new SessionGenerator(fakeRandom());

    const { proposals } = generator.generate(input(autoConfig(), [G1]));

    expect(proposals).toHaveLength(1);
    const proposal = proposals[0]!;
    expect(proposal.groupId).toBe(G1);
    expect(proposal.gapViolations).toEqual([]);
    // Identity shuffle scans the pool in order: {Mon,Tue} fails the 2-day gap, {Mon,Wed} is first to pass.
    expect(proposal.blocks).toEqual([
      { dayOfWeek: MON, start: '09:00', end: '10:30' },
      { dayOfWeek: WED, start: '09:00', end: '10:30' },
    ]);
    expect(satisfiesMinGap(proposal.blocks.map((b) => b.dayOfWeek), 2)).toBe(true);
  });

  it('places each block at that weekday’s own opening time', () => {
    const generator = new SessionGenerator(fakeRandom());
    const hours = centerHours({ [WED]: { dayOfWeek: WED, open: '14:00' as TimeOfDay, close: '20:00' as TimeOfDay } });

    const { proposals } = generator.generate(input(autoConfig(), [G1], hours));

    expect(proposals[0]!.blocks).toEqual([
      { dayOfWeek: MON, start: '09:00', end: '10:30' },
      { dayOfWeek: WED, start: '14:00', end: '15:30' },
    ]);
  });

  it('generates independently for each group in scope', () => {
    const generator = new SessionGenerator(seededRandom(7));

    const { proposals } = generator.generate(input(autoConfig(), [G1, G2]));

    expect(proposals.map((p) => p.groupId)).toEqual([G1, G2]);
    for (const proposal of proposals) {
      expect(proposal.blocks).toHaveLength(2);
      expect(satisfiesMinGap(proposal.blocks.map((b) => b.dayOfWeek), 2)).toBe(true);
    }
  });

  it('holds the gap constraint across the exam-prep track exactly as the regular track', () => {
    const generator = new SessionGenerator(fakeRandom());
    const kinds: readonly GroupKind[] = ['regular', 'exam-prep'];

    for (const kind of kinds) {
      const { proposals } = generator.generate(input(autoConfig({ kind }), [G1]));
      expect(satisfiesMinGap(proposals[0]!.blocks.map((b) => b.dayOfWeek), 2)).toBe(true);
    }
  });

  it('is deterministic for a given seed', () => {
    const first = new SessionGenerator(seededRandom(42)).generate(input(autoConfig(), [G1]));
    const second = new SessionGenerator(seededRandom(42)).generate(input(autoConfig(), [G1]));
    expect(first).toEqual(second);
  });

  it('excludes weekdays the center is closed on from the eligible pool', () => {
    const generator = new SessionGenerator(fakeRandom());
    // Pool asks for Sunday, but the center is closed then, leaving only Monday eligible.
    const config = autoConfig({ weekdayPool: [SUN, MON], sessionsPerWeek: 2 });

    try {
      generator.generate(input(config, [G1]));
      expect.unreachable('expected an infeasible-config throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InfeasibleGeneratorConfigError);
      const infeasible = error as InfeasibleGeneratorConfigError;
      expect(infeasible.reason).toBe('pool-smaller-than-sessions');
      expect(infeasible.eligibleWeekdays).toEqual([MON]);
    }
  });

  it('throws when the gap cannot be satisfied (3×/week with a 3-day gap)', () => {
    const generator = new SessionGenerator(fakeRandom());
    const config = autoConfig({
      weekdayPool: [MON, TUE, WED, THU, FRI, SAT],
      sessionsPerWeek: 3,
      minGapDays: 3,
    });

    expect(() => generator.generate(input(config, [G1]))).toThrow(InfeasibleGeneratorConfigError);
    try {
      generator.generate(input(config, [G1]));
    } catch (error) {
      expect((error as InfeasibleGeneratorConfigError).reason).toBe('gap-unsatisfiable');
    }
  });

  it('throws when sessionsPerWeek is not positive', () => {
    const generator = new SessionGenerator(fakeRandom());

    try {
      generator.generate(input(autoConfig({ sessionsPerWeek: 0 }), [G1]));
      expect.unreachable('expected an infeasible-config throw');
    } catch (error) {
      expect((error as InfeasibleGeneratorConfigError).reason).toBe('non-positive-sessions-per-week');
    }
  });

  it('returns no proposals when the scope resolved to no groups', () => {
    const generator = new SessionGenerator(fakeRandom());
    expect(generator.generate(input(autoConfig(), [])).proposals).toEqual([]);
  });
});

describe('SessionGenerator — custom mode', () => {
  function customConfig(pickedWeekdays: readonly WeekdayIndex[], over: Partial<SessionGeneratorConfig> = {}): SessionGeneratorConfig {
    return { ...autoConfig({ ...over }), mode: 'custom', pickedWeekdays } as SessionGeneratorConfig;
  }

  it('builds blocks for a valid admin pick with no violations', () => {
    const generator = new SessionGenerator(fakeRandom());

    const { proposals } = generator.generate(input(customConfig([MON, WED, FRI], { minGapDays: 2 }), [G1]));

    expect(proposals[0]!.blocks.map((b) => b.dayOfWeek)).toEqual([MON, WED, FRI]);
    expect(proposals[0]!.gapViolations).toEqual([]);
  });

  it('flags a gap breach without blocking the block', () => {
    const generator = new SessionGenerator(fakeRandom());

    const { proposals } = generator.generate(input(customConfig([MON, TUE], { minGapDays: 2 }), [G1]));

    // Not blocked: both blocks are still produced.
    expect(proposals[0]!.blocks.map((b) => b.dayOfWeek)).toEqual([MON, TUE]);
    // But flagged: Mon→Tue is a 1-day gap under a 2-day minimum.
    expect(proposals[0]!.gapViolations).toContainEqual({ fromDay: MON, toDay: TUE, gapDays: 1 });
  });

  it('skips a picked weekday the center is closed on but still reports its gap', () => {
    const generator = new SessionGenerator(fakeRandom());

    const { proposals } = generator.generate(input(customConfig([SUN, MON], { minGapDays: 2 }), [G1]));

    // Sunday is closed → no block; only Monday is placed.
    expect(proposals[0]!.blocks.map((b) => b.dayOfWeek)).toEqual([MON]);
    // The gap is still measured over what the admin picked.
    expect(proposals[0]!.gapViolations).toContainEqual({ fromDay: SUN, toDay: MON, gapDays: 1 });
  });
});
