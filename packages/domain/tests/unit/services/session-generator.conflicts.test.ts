import { describe, it, expect } from 'vitest';
import { SessionGenerator, type SessionGeneratorConfig, type SessionGenerationInput } from '../../../src/services/session-generator';
import type { DayHours } from '../../../src/policies/session-conflict-policy';
import type { ScheduledSessionRef } from '../../../src/errors/scheduling-errors';
import type { GroupId, GroupKind } from '../../../src/entities/group';
import type { RoomId } from '../../../src/entities/room';
import type { EntityId } from '../../../src/value-objects/ids';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import { fakeRandom, sequenceRandom } from '../fakes/random';

const MON = 1 as WeekdayIndex;
const TUE = 2 as WeekdayIndex;

const G1 = 'grp_00000000000000000000000001' as GroupId;
const G2 = 'grp_00000000000000000000000002' as GroupId;

const ROOM_A = 'rom_00000000000000000000000001' as RoomId;
const ROOM_B = 'rom_00000000000000000000000002' as RoomId;

/** Center open Mon+Tue 09:00–10:00 — narrow on purpose so a 90-minute block overruns it. */
const centerHours: readonly DayHours[] = [
  { dayOfWeek: MON, open: '09:00' as TimeOfDay, close: '10:00' as TimeOfDay },
  { dayOfWeek: TUE, open: '09:00' as TimeOfDay, close: '18:00' as TimeOfDay },
];

function autoConfig(over: Partial<SessionGeneratorConfig> = {}): SessionGeneratorConfig {
  return {
    scope: { groups: 'all', teachers: 'all' },
    kind: 'regular' as GroupKind,
    weekdayPool: [MON, TUE],
    sessionsPerWeek: 1,
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
    rooms?: readonly RoomId[];
    existingSchedule?: readonly ScheduledSessionRef[];
    teacherByGroup?: ReadonlyMap<GroupId, EntityId | null>;
  } = {},
): SessionGenerationInput {
  return {
    config,
    groups,
    teacherByGroup: options.teacherByGroup ?? new Map(),
    rooms: options.rooms ?? [ROOM_A],
    centerHours,
    existingSchedule: options.existingSchedule ?? [],
  };
}

describe('SessionGenerator — conflict detection (SOU-161)', () => {
  it('returns an empty conflicts list when nothing clashes', () => {
    const generator = new SessionGenerator(fakeRandom());
    const { conflicts } = generator.generate(input(autoConfig({ weekdayPool: [TUE] }), [G1]));
    expect(conflicts).toEqual([]);
  });

  it('flags a generated block that overruns center closing time, without dropping the block', () => {
    const generator = new SessionGenerator(fakeRandom());
    // Monday closes at 10:00; a 90-minute block from 09:00 overruns it by 30 minutes.
    const { proposals, conflicts } = generator.generate(input(autoConfig({ weekdayPool: [MON] }), [G1]));

    expect(proposals[0]!.blocks).toEqual([{ block: { dayOfWeek: MON, start: '09:00', end: '10:30' }, roomId: ROOM_A }]);
    expect(conflicts).toEqual([{ kind: 'hours', groupId: G1, error: expect.objectContaining({ reason: 'after-close' }) }]);
  });

  it('flags a room double-booked against the real, already-committed schedule', () => {
    const generator = new SessionGenerator(fakeRandom());
    const existing: readonly ScheduledSessionRef[] = [
      { id: 'ses_1' as EntityId, roomId: ROOM_A, dayOfWeek: TUE, start: '09:30' as TimeOfDay, end: '11:00' as TimeOfDay },
    ];

    const { conflicts } = generator.generate(input(autoConfig({ weekdayPool: [TUE] }), [G1], { existingSchedule: existing }));

    expect(conflicts).toEqual([{ kind: 'room', groupId: G1, error: expect.objectContaining({ roomId: ROOM_A }) }]);
  });

  it('flags two sibling groups double-booked into the same room by random draw in one run', () => {
    const generator = new SessionGenerator(sequenceRandom([0, 0]));
    const config = autoConfig({ weekdayPool: [TUE] });

    const { conflicts } = generator.generate(input(config, [G1, G2], { rooms: [ROOM_A, ROOM_B] }));

    expect(conflicts.map((c) => c.kind)).toEqual(['room', 'room']);
    expect(conflicts.map((c) => c.groupId).sort()).toEqual([G1, G2]);
  });
});
