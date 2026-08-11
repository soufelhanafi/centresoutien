import { describe, it, expect } from 'vitest';
import {
  SessionGenerator,
  assignRoomsToBlocks,
  type SessionGeneratorConfig,
  type SessionGenerationInput,
  type UnroomedBlock,
} from '../../../src/services/session-generator';
import { InfeasibleGeneratorConfigError, NoRoomsConfiguredError } from '../../../src/errors/session-generator-errors';
import type { ScheduledSessionRef } from '../../../src/errors/scheduling-errors';
import { satisfiesMinGap } from '../../../src/policies/weekday-gap';
import type { DayHours } from '../../../src/policies/session-conflict-policy';
import type { GroupId, GroupKind } from '../../../src/entities/group';
import type { RoomId } from '../../../src/entities/room';
import type { EntityId } from '../../../src/value-objects/ids';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeeklyBlock } from '../../../src/value-objects/weekly-block';
import { fakeRandom, seededRandom, sequenceRandom } from '../fakes/random';

const SUN = 0 as WeekdayIndex;
const MON = 1 as WeekdayIndex;
const TUE = 2 as WeekdayIndex;
const WED = 3 as WeekdayIndex;
const THU = 4 as WeekdayIndex;
const FRI = 5 as WeekdayIndex;
const SAT = 6 as WeekdayIndex;

const G1 = 'grp_00000000000000000000000001' as GroupId;
const G2 = 'grp_00000000000000000000000002' as GroupId;

const ROOM_A = 'rom_00000000000000000000000001' as RoomId;
const ROOM_B = 'rom_00000000000000000000000002' as RoomId;
const ROOM_C = 'rom_00000000000000000000000003' as RoomId;

const TEACHER_1 = 'tch_00000000000000000000000001' as EntityId;
const TEACHER_2 = 'tch_00000000000000000000000002' as EntityId;

/** Center open 09:00–18:00 Mon–Sat; Sunday closed. Override any day via `over`. */
function centerHours(over: Partial<Record<WeekdayIndex, DayHours>> = {}): readonly DayHours[] {
  const openWeek: WeekdayIndex[] = [MON, TUE, WED, THU, FRI, SAT];
  const week: DayHours[] = [
    { dayOfWeek: SUN, windows: [] },
    ...openWeek.map((dayOfWeek) => ({
      dayOfWeek,
      windows: [{ open: '09:00' as TimeOfDay, close: '18:00' as TimeOfDay }],
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

function input(
  config: SessionGeneratorConfig,
  groups: readonly GroupId[],
  options: {
    hours?: readonly DayHours[];
    teacherByGroup?: ReadonlyMap<GroupId, EntityId | null>;
    rooms?: readonly RoomId[];
    existingSchedule?: readonly ScheduledSessionRef[];
  } = {},
): SessionGenerationInput {
  return {
    config,
    groups,
    teacherByGroup: options.teacherByGroup ?? new Map(),
    rooms: options.rooms ?? [ROOM_A],
    centerHours: options.hours ?? centerHours(),
    existingSchedule: options.existingSchedule ?? [],
  };
}

function blockDays(proposal: { blocks: readonly { block: WeeklyBlock; roomId: RoomId }[] }): readonly WeekdayIndex[] {
  return proposal.blocks.map((scheduled) => scheduled.block.dayOfWeek);
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
      { block: { dayOfWeek: MON, start: '09:00', end: '10:30' }, roomId: ROOM_A, teacherId: null },
      { block: { dayOfWeek: WED, start: '09:00', end: '10:30' }, roomId: ROOM_A, teacherId: null },
    ]);
    expect(satisfiesMinGap(blockDays(proposal), 2)).toBe(true);
  });

  it('places each block at that weekday’s own opening time', () => {
    const generator = new SessionGenerator(fakeRandom());
    const hours = centerHours({
      [WED]: { dayOfWeek: WED, windows: [{ open: '14:00' as TimeOfDay, close: '20:00' as TimeOfDay }] },
    });

    const { proposals } = generator.generate(input(autoConfig(), [G1], { hours }));

    expect(proposals[0]!.blocks.map((b) => b.block)).toEqual([
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
      expect(satisfiesMinGap(blockDays(proposal), 2)).toBe(true);
    }
  });

  it('holds the gap constraint across the exam-prep track exactly as the regular track', () => {
    const generator = new SessionGenerator(fakeRandom());
    const kinds: readonly GroupKind[] = ['regular', 'exam-prep'];

    for (const kind of kinds) {
      const { proposals } = generator.generate(input(autoConfig({ kind }), [G1]));
      expect(satisfiesMinGap(blockDays(proposals[0]!), 2)).toBe(true);
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

    expect(blockDays(proposals[0]!)).toEqual([MON, WED, FRI]);
    expect(proposals[0]!.gapViolations).toEqual([]);
  });

  it('flags a gap breach without blocking the block', () => {
    const generator = new SessionGenerator(fakeRandom());

    const { proposals } = generator.generate(input(customConfig([MON, TUE], { minGapDays: 2 }), [G1]));

    // Not blocked: both blocks are still produced.
    expect(blockDays(proposals[0]!)).toEqual([MON, TUE]);
    // But flagged: Mon→Tue is a 1-day gap under a 2-day minimum.
    expect(proposals[0]!.gapViolations).toContainEqual({ fromDay: MON, toDay: TUE, gapDays: 1 });
  });

  it('skips a picked weekday the center is closed on but still reports its gap', () => {
    const generator = new SessionGenerator(fakeRandom());

    const { proposals } = generator.generate(input(customConfig([SUN, MON], { minGapDays: 2 }), [G1]));

    // Sunday is closed → no block; only Monday is placed.
    expect(blockDays(proposals[0]!)).toEqual([MON]);
    // The gap is still measured over what the admin picked.
    expect(proposals[0]!.gapViolations).toContainEqual({ fromDay: SUN, toDay: MON, gapDays: 1 });
  });
});

describe('SessionGenerator — room assignment (SOU-158)', () => {
  it('assigns a room from the pool to every generated block', () => {
    const generator = new SessionGenerator(fakeRandom());

    const { proposals } = generator.generate(input(autoConfig(), [G1, G2], { rooms: [ROOM_A, ROOM_B, ROOM_C] }));

    for (const proposal of proposals) {
      for (const scheduled of proposal.blocks) {
        expect([ROOM_A, ROOM_B, ROOM_C]).toContain(scheduled.roomId);
      }
    }
  });

  it('throws NoRoomsConfiguredError when generating blocks with an empty room pool', () => {
    const generator = new SessionGenerator(fakeRandom());

    expect(() => generator.generate(input(autoConfig(), [G1], { rooms: [] }))).toThrow(NoRoomsConfiguredError);
  });

  it('does not throw when the room pool is empty but no blocks are generated', () => {
    const generator = new SessionGenerator(fakeRandom());

    expect(() => generator.generate(input(autoConfig(), [], { rooms: [] }))).not.toThrow();
  });
});

describe('assignRoomsToBlocks', () => {
  function unroomed(groupId: GroupId, teacherId: EntityId | null, block: WeeklyBlock): UnroomedBlock {
    return { groupId, teacherId, block };
  }

  it('randomizes the room draw for unrelated blocks via the injected RandomPort', () => {
    const first = unroomed(G1, null, { dayOfWeek: MON, start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay });
    const second = unroomed(G2, null, { dayOfWeek: TUE, start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay });

    const roomByBlock = assignRoomsToBlocks([first, second], [ROOM_A, ROOM_B, ROOM_C], sequenceRandom([0, 2]));

    expect(roomByBlock.get(first.block)).toBe(ROOM_A);
    expect(roomByBlock.get(second.block)).toBe(ROOM_C);
  });

  it('reuses the same room for two back-to-back blocks of the same teacher on the same weekday', () => {
    const earlier = unroomed(G1, TEACHER_1, { dayOfWeek: MON, start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay });
    const later = unroomed(G2, TEACHER_1, { dayOfWeek: MON, start: '10:30' as TimeOfDay, end: '12:00' as TimeOfDay });

    const roomByBlock = assignRoomsToBlocks([earlier, later], [ROOM_A, ROOM_B, ROOM_C], sequenceRandom([1]));

    expect(roomByBlock.get(earlier.block)).toBe(ROOM_B);
    expect(roomByBlock.get(later.block)).toBe(ROOM_B);
  });

  it('propagates the same room across a chain of three consecutive back-to-back blocks', () => {
    const first = unroomed(G1, TEACHER_1, { dayOfWeek: MON, start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay });
    const second = unroomed(G2, TEACHER_1, { dayOfWeek: MON, start: '10:30' as TimeOfDay, end: '12:00' as TimeOfDay });
    const third = unroomed(G1, TEACHER_1, { dayOfWeek: MON, start: '12:00' as TimeOfDay, end: '13:30' as TimeOfDay });

    const roomByBlock = assignRoomsToBlocks([first, second, third], [ROOM_A, ROOM_B, ROOM_C], sequenceRandom([2]));

    expect(roomByBlock.get(first.block)).toBe(ROOM_C);
    expect(roomByBlock.get(second.block)).toBe(ROOM_C);
    expect(roomByBlock.get(third.block)).toBe(ROOM_C);
  });

  it('does not link two blocks of the same teacher and day that are not literally back-to-back', () => {
    const morning = unroomed(G1, TEACHER_1, { dayOfWeek: MON, start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay });
    const afternoon = unroomed(G2, TEACHER_1, { dayOfWeek: MON, start: '14:00' as TimeOfDay, end: '15:30' as TimeOfDay });

    const roomByBlock = assignRoomsToBlocks([morning, afternoon], [ROOM_A, ROOM_B, ROOM_C], sequenceRandom([0, 2]));

    expect(roomByBlock.get(morning.block)).toBe(ROOM_A);
    expect(roomByBlock.get(afternoon.block)).toBe(ROOM_C);
  });

  it('does not link back-to-back blocks belonging to different teachers', () => {
    const earlier = unroomed(G1, TEACHER_1, { dayOfWeek: MON, start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay });
    const later = unroomed(G2, TEACHER_2, { dayOfWeek: MON, start: '10:30' as TimeOfDay, end: '12:00' as TimeOfDay });

    const roomByBlock = assignRoomsToBlocks([earlier, later], [ROOM_A, ROOM_B, ROOM_C], sequenceRandom([0, 2]));

    expect(roomByBlock.get(earlier.block)).toBe(ROOM_A);
    expect(roomByBlock.get(later.block)).toBe(ROOM_C);
  });

  it('does not link back-to-back blocks with no teacher assigned', () => {
    const earlier = unroomed(G1, null, { dayOfWeek: MON, start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay });
    const later = unroomed(G2, null, { dayOfWeek: MON, start: '10:30' as TimeOfDay, end: '12:00' as TimeOfDay });

    const roomByBlock = assignRoomsToBlocks([earlier, later], [ROOM_A, ROOM_B, ROOM_C], sequenceRandom([0, 2]));

    expect(roomByBlock.get(earlier.block)).toBe(ROOM_A);
    expect(roomByBlock.get(later.block)).toBe(ROOM_C);
  });

  it('throws NoRoomsConfiguredError when there are blocks to assign but no rooms', () => {
    const block = unroomed(G1, null, { dayOfWeek: MON, start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay });

    expect(() => assignRoomsToBlocks([block], [], fakeRandom())).toThrow(NoRoomsConfiguredError);
  });

  it('returns an empty map without throwing when there are no blocks, even with no rooms', () => {
    expect(assignRoomsToBlocks([], [], fakeRandom())).toEqual(new Map());
  });
});
