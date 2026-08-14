import { describe, it, expect } from 'vitest';
import {
  SessionGenerator,
  assignRoomsToBlocks,
  type SessionGeneratorConfig,
  type SessionGenerationInput,
  type UnroomedBlock,
} from '../../../src/services/session-generator';
import { InfeasibleGeneratorConfigError } from '../../../src/errors/session-generator-errors';
import type { DayHours } from '../../../src/policies/session-conflict-policy';
import type { ScheduledSessionRef } from '../../../src/errors/scheduling-errors';
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

const GROUPS = [1, 2, 3, 4, 5].map((n) => `grp_0000000000000000000000000${n}` as GroupId);
const ROOMS = [1, 2, 3, 4, 5].map((n) => `rom_0000000000000000000000000${n}` as RoomId);
const TEACHERS = [1, 2, 3, 4, 5].map((n) => `tch_0000000000000000000000000${n}` as EntityId);

const [G1, G2, G3] = GROUPS as [GroupId, GroupId, GroupId];
const [ROOM_A, ROOM_B] = ROOMS as [RoomId, RoomId];

function centerHours(openDays: readonly WeekdayIndex[]): readonly DayHours[] {
  return [SUN, MON, TUE, WED, THU, FRI, SAT].map((dayOfWeek) => ({
    dayOfWeek,
    windows: openDays.includes(dayOfWeek)
      ? [{ open: '09:00' as TimeOfDay, close: '18:00' as TimeOfDay }]
      : [],
  }));
}

function autoConfig(over: Partial<SessionGeneratorConfig> = {}): SessionGeneratorConfig {
  return {
    scope: { groups: 'all', teachers: 'all' },
    kind: 'regular' as GroupKind,
    weekdayPool: [MON, TUE, WED, THU, FRI, SAT],
    sessionsPerWeek: 3,
    minGapDays: 1,
    sessionDurationMinutes: 120,
    range: { startDate: '2026-09-01', endDate: '2026-12-31' },
    mode: 'auto',
    ...over,
  } as SessionGeneratorConfig;
}

function customConfig(
  pickedWeekdays: readonly WeekdayIndex[],
  over: Partial<SessionGeneratorConfig> = {},
): SessionGeneratorConfig {
  return { ...autoConfig(over), mode: 'custom', pickedWeekdays } as SessionGeneratorConfig;
}

function input(
  config: SessionGeneratorConfig,
  groups: readonly GroupId[],
  options: {
    rooms?: readonly RoomId[];
    hours?: readonly DayHours[];
    teacherByGroup?: ReadonlyMap<GroupId, EntityId | null>;
    existingSchedule?: readonly ScheduledSessionRef[];
  } = {},
): SessionGenerationInput {
  return {
    config,
    groups,
    teacherByGroup: options.teacherByGroup ?? new Map(),
    rooms: options.rooms ?? ROOMS,
    centerHours: options.hours ?? centerHours([MON, TUE, WED, THU, FRI, SAT]),
    existingSchedule: options.existingSchedule ?? [],
  };
}

function distinctTeachers(): ReadonlyMap<GroupId, EntityId | null> {
  return new Map(GROUPS.map((group, index) => [group, TEACHERS[index] ?? null]));
}

describe('assignRoomsToBlocks — collision-aware draw (SOU-261 F1)', () => {
  function unroomed(groupId: GroupId, teacherId: EntityId | null, block: WeeklyBlock): UnroomedBlock {
    return { groupId, teacherId, block };
  }
  const at = (dayOfWeek: WeekdayIndex, start: string, end: string): WeeklyBlock => ({
    dayOfWeek,
    start: start as TimeOfDay,
    end: end as TimeOfDay,
  });

  it('never draws a room already taken by an overlapping sibling while a free room exists', () => {
    const first = unroomed(G1, null, at(MON, '09:00', '11:00'));
    const second = unroomed(G2, null, at(MON, '09:00', '11:00'));

    // A collision-blind draw would give both blocks ROOM_A (index 0 twice).
    const roomByBlock = assignRoomsToBlocks([first, second], [ROOM_A, ROOM_B], sequenceRandom([0, 0]));

    expect(roomByBlock.get(first.block)).toBe(ROOM_A);
    expect(roomByBlock.get(second.block)).toBe(ROOM_B);
  });

  it('avoids rooms occupied by the already-committed schedule at an overlapping slot', () => {
    const block = unroomed(G1, null, at(MON, '09:00', '11:00'));
    const occupied: readonly ScheduledSessionRef[] = [
      { id: 'ses_1' as EntityId, roomId: ROOM_A, dayOfWeek: MON, start: '10:00' as TimeOfDay, end: '12:00' as TimeOfDay },
    ];

    const roomByBlock = assignRoomsToBlocks([block], [ROOM_A, ROOM_B], sequenceRandom([0]), occupied);

    expect(roomByBlock.get(block.block)).toBe(ROOM_B);
  });

  it('still draws freely for blocks that only touch endpoints (back-to-back is not overlap)', () => {
    const earlier = unroomed(G1, null, at(MON, '09:00', '11:00'));
    const later = unroomed(G2, null, at(MON, '11:00', '13:00'));

    const roomByBlock = assignRoomsToBlocks([earlier, later], [ROOM_A, ROOM_B], sequenceRandom([0, 0]));

    expect(roomByBlock.get(earlier.block)).toBe(ROOM_A);
    expect(roomByBlock.get(later.block)).toBe(ROOM_A);
  });

  it('falls back to a random room when every room is taken at the overlapping slot', () => {
    const blocks = [G1, G2, G3].map((group) => unroomed(group, null, at(MON, '09:00', '11:00')));

    const roomByBlock = assignRoomsToBlocks(blocks, [ROOM_A, ROOM_B], sequenceRandom([0, 0, 1]));

    expect(roomByBlock.get(blocks[0]!.block)).toBe(ROOM_A);
    expect(roomByBlock.get(blocks[1]!.block)).toBe(ROOM_B);
    // Third block: no free room left — the draw runs over the full pool again.
    expect(roomByBlock.get(blocks[2]!.block)).toBe(ROOM_B);
  });
});

describe('SessionGenerator — feasible runs generate conflict-free (SOU-261)', () => {
  it('5 groups × 5 rooms sharing 3 forced days: zero conflicts across seeds', () => {
    // The SOU-261 repro: pool Mon/Wed/Fri only, so all five groups share all
    // three days. Five rooms are exactly enough — before the fix, 100/100 seeds
    // produced room conflicts here.
    const config = autoConfig({ weekdayPool: [MON, WED, FRI], sessionsPerWeek: 3, minGapDays: 1 });
    for (let seed = 0; seed < 25; seed += 1) {
      const run = input(config, GROUPS, {
        hours: centerHours([MON, WED, FRI]),
        teacherByGroup: distinctTeachers(),
      });
      const { conflicts } = new SessionGenerator(seededRandom(seed)).generate(run);
      expect(conflicts).toEqual([]);
    }
  });

  it('5 groups × 5 rooms on a wide pool: zero conflicts across seeds', () => {
    const config = autoConfig({ weekdayPool: [MON, TUE, WED, THU, FRI, SAT], sessionsPerWeek: 3, minGapDays: 1 });
    for (let seed = 0; seed < 25; seed += 1) {
      const run = input(config, GROUPS, { teacherByGroup: distinctTeachers() });
      const { conflicts } = new SessionGenerator(seededRandom(seed)).generate(run);
      expect(conflicts).toEqual([]);
    }
  });

  it('run-wide rooming avoids rooms taken by the real schedule, not just siblings', () => {
    const existing: readonly ScheduledSessionRef[] = [
      { id: 'ses_1' as EntityId, roomId: ROOM_A, dayOfWeek: MON, start: '09:00' as TimeOfDay, end: '11:00' as TimeOfDay },
    ];
    const config = customConfig([MON], { sessionsPerWeek: 1 });

    const { proposals, conflicts } = new SessionGenerator(sequenceRandom([0, 0])).generate(
      input(config, [G1], { rooms: [ROOM_A, ROOM_B], existingSchedule: existing }),
    );

    expect(proposals[0]!.blocks[0]!.roomId).toBe(ROOM_B);
    expect(conflicts).toEqual([]);
  });

  it('custom mode still flags the clash when overlapping demand exceeds the rooms', () => {
    // Three groups pinned to one day with two rooms: the third block has no free
    // room; custom mode never blocks, so the clash is flagged, not thrown.
    const config = customConfig([MON], { sessionsPerWeek: 1 });

    const { proposals, conflicts } = new SessionGenerator(fakeRandom()).generate(
      input(config, [G1, G2, G3], { rooms: [ROOM_A, ROOM_B] }),
    );

    expect(proposals).toHaveLength(3);
    expect(conflicts.some((conflict) => conflict.kind === 'room')).toBe(true);
  });
});

describe('SessionGenerator — room-capacity guard (SOU-261 F3)', () => {
  it('throws room-capacity-exceeded when weekly demand outgrows days × rooms', () => {
    // 3 groups × 1 session on a single eligible day with 2 rooms: 3 > 1×2.
    const config = autoConfig({ weekdayPool: [TUE], sessionsPerWeek: 1 });

    try {
      new SessionGenerator(fakeRandom()).generate(input(config, [G1, G2, G3], { rooms: [ROOM_A, ROOM_B] }));
      expect.unreachable('expected an infeasible-config throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InfeasibleGeneratorConfigError);
      expect((error as InfeasibleGeneratorConfigError).reason).toBe('room-capacity-exceeded');
    }
  });

  it('does not throw when demand exactly fills capacity', () => {
    const config = autoConfig({ weekdayPool: [MON, WED], sessionsPerWeek: 1, minGapDays: 1 });

    const { proposals } = new SessionGenerator(fakeRandom()).generate(
      input(config, [G1, G2, G3, GROUPS[3]!], { rooms: [ROOM_A, ROOM_B] }),
    );

    expect(proposals).toHaveLength(4);
  });

  it('keeps pool-smaller-than-sessions as the reason when the pool itself is too small', () => {
    // The capacity guard must not shadow the more actionable pool-size reason:
    // Sunday is closed, leaving one eligible day for two weekly sessions.
    const config = autoConfig({ weekdayPool: [SUN, MON], sessionsPerWeek: 2 });

    try {
      new SessionGenerator(fakeRandom()).generate(input(config, [G1], { rooms: [ROOM_A] }));
      expect.unreachable('expected an infeasible-config throw');
    } catch (error) {
      expect((error as InfeasibleGeneratorConfigError).reason).toBe('pool-smaller-than-sessions');
    }
  });
});

describe('SessionGenerator — duration guard (SOU-261 F4)', () => {
  it('auto mode throws duration-exceeds-windows when no pool day fits the duration', () => {
    // 10h session in a 9h day, on every pool day.
    const config = autoConfig({ weekdayPool: [MON, TUE], sessionsPerWeek: 1, sessionDurationMinutes: 600 });

    try {
      new SessionGenerator(fakeRandom()).generate(input(config, [G1]));
      expect.unreachable('expected an infeasible-config throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InfeasibleGeneratorConfigError);
      expect((error as InfeasibleGeneratorConfigError).reason).toBe('duration-exceeds-windows');
    }
  });

  it('auto mode drops a too-short day from the pool and places on a fitting one', () => {
    const hours: readonly DayHours[] = [
      { dayOfWeek: MON, windows: [{ open: '09:00' as TimeOfDay, close: '10:00' as TimeOfDay }] },
      { dayOfWeek: TUE, windows: [{ open: '09:00' as TimeOfDay, close: '18:00' as TimeOfDay }] },
    ];
    const config = autoConfig({ weekdayPool: [MON, TUE], sessionsPerWeek: 1, sessionDurationMinutes: 90 });

    const { proposals, conflicts } = new SessionGenerator(fakeRandom()).generate(
      input(config, [G1], { hours, rooms: [ROOM_A] }),
    );

    expect(proposals[0]!.blocks.map((scheduled) => scheduled.block.dayOfWeek)).toEqual([TUE]);
    expect(conflicts).toEqual([]);
  });

  it('throws pool-smaller-than-sessions when the duration filter shrinks the pool below the weekly count', () => {
    const hours: readonly DayHours[] = [
      { dayOfWeek: MON, windows: [{ open: '09:00' as TimeOfDay, close: '10:00' as TimeOfDay }] },
      { dayOfWeek: TUE, windows: [{ open: '09:00' as TimeOfDay, close: '18:00' as TimeOfDay }] },
    ];
    const config = autoConfig({ weekdayPool: [MON, TUE], sessionsPerWeek: 2, minGapDays: 1, sessionDurationMinutes: 90 });

    try {
      new SessionGenerator(fakeRandom()).generate(input(config, [G1], { hours, rooms: [ROOM_A] }));
      expect.unreachable('expected an infeasible-config throw');
    } catch (error) {
      expect((error as InfeasibleGeneratorConfigError).reason).toBe('pool-smaller-than-sessions');
    }
  });

  it('custom mode keeps flagging the overrun instead of throwing', () => {
    const hours: readonly DayHours[] = [
      { dayOfWeek: MON, windows: [{ open: '09:00' as TimeOfDay, close: '10:00' as TimeOfDay }] },
    ];
    const config = customConfig([MON], { sessionsPerWeek: 1, sessionDurationMinutes: 90 });

    const { proposals, conflicts } = new SessionGenerator(fakeRandom()).generate(
      input(config, [G1], { hours, rooms: [ROOM_A] }),
    );

    expect(proposals[0]!.blocks).toHaveLength(1);
    expect(conflicts.some((conflict) => conflict.kind === 'hours')).toBe(true);
  });
});
