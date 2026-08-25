import { describe, it, expect } from 'vitest';
import { SessionGenerator, type SessionGeneratorConfig, type SessionGenerationInput } from '../../../src/services/session-generator';
import type { TeacherAvailabilityRules } from '../../../src/policies/teacher-availability-policy';
import type { DayHours } from '../../../src/policies/session-conflict-policy';
import type { WeeklyTimeWindows } from '../../../src/entities/center-hours-override';
import type { GroupId, GroupKind } from '../../../src/entities/group';
import type { RoomId } from '../../../src/entities/room';
import type { EntityId } from '../../../src/value-objects/ids';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import { fakeRandom } from '../fakes/random';

const MON = 1 as WeekdayIndex;

const G1 = 'grp_00000000000000000000000001' as GroupId;
const G2 = 'grp_00000000000000000000000002' as GroupId;
const G3 = 'grp_00000000000000000000000003' as GroupId;
const ROOM_A = 'rom_00000000000000000000000001' as RoomId;
const ROOM_B = 'rom_00000000000000000000000002' as RoomId;
const ROOM_C = 'rom_00000000000000000000000003' as RoomId;
const TEACHER = 'tea_00000000000000000000000001' as EntityId;

const emptyWeek = (): WeeklyTimeWindows => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });

function autoConfig(over: Partial<SessionGeneratorConfig> = {}): SessionGeneratorConfig {
  return {
    scope: { groups: 'all', teachers: 'all' },
    kind: 'regular' as GroupKind,
    weekdayPool: [MON],
    sessionsPerWeek: 1,
    minGapDays: 1,
    sessionDurationMinutes: 90,
    range: { startDate: '2026-09-01', endDate: '2026-12-31' },
    mode: 'auto',
    ...over,
  } as SessionGeneratorConfig;
}

function input(
  config: SessionGeneratorConfig,
  groups: readonly GroupId[],
  centerHours: readonly DayHours[],
  options: {
    availabilityByTeacher?: ReadonlyMap<EntityId, TeacherAvailabilityRules>;
    rooms?: readonly RoomId[];
  } = {},
): SessionGenerationInput {
  return {
    config,
    groups,
    teacherByGroup: new Map(groups.map((groupId) => [groupId, TEACHER])),
    rooms: options.rooms ?? [ROOM_A, ROOM_B],
    centerHours,
    existingSchedule: [],
    ...(options.availabilityByTeacher === undefined ? {} : { availabilityByTeacher: options.availabilityByTeacher }),
  };
}

type GeneratedProposals = ReturnType<SessionGenerator['generate']>['proposals'];

function blockTimes(proposals: GeneratedProposals, groupId: GroupId): readonly { start: TimeOfDay; end: TimeOfDay }[] {
  const proposal = proposals.find((p) => p.groupId === groupId)!;
  return proposal.blocks.map((scheduled) => ({ start: scheduled.block.start, end: scheduled.block.end }));
}

describe('SessionGenerator — same-teacher, same-day packing (bug repro)', () => {
  it('bug 1: center open Monday 19:00–22:00 only — two groups sharing a teacher pack back-to-back instead of colliding', () => {
    const generator = new SessionGenerator(fakeRandom());
    const centerHours: readonly DayHours[] = [
      { dayOfWeek: MON, windows: [{ open: '19:00' as TimeOfDay, close: '22:00' as TimeOfDay }] },
    ];
    const rules: TeacherAvailabilityRules = {
      weeklyWindows: { ...emptyWeek(), [MON]: [{ open: '19:00' as TimeOfDay, close: '22:00' as TimeOfDay }] },
      exceptions: [],
    };

    const { proposals, conflicts } = generator.generate(
      input(autoConfig(), [G1, G2], centerHours, { availabilityByTeacher: new Map([[TEACHER, rules]]) }),
    );

    expect(blockTimes(proposals, G1)).toEqual([{ start: '19:00', end: '20:30' }]);
    expect(blockTimes(proposals, G2)).toEqual([{ start: '20:30', end: '22:00' }]);
    expect(conflicts).toEqual([]);
  });

  it('bug 2: center open 09:00–22:00, teacher only available 19:00–22:00 — both groups land inside availability, packed back-to-back', () => {
    const generator = new SessionGenerator(fakeRandom());
    const centerHours: readonly DayHours[] = [
      { dayOfWeek: MON, windows: [{ open: '09:00' as TimeOfDay, close: '22:00' as TimeOfDay }] },
    ];
    const rules: TeacherAvailabilityRules = {
      weeklyWindows: { ...emptyWeek(), [MON]: [{ open: '19:00' as TimeOfDay, close: '22:00' as TimeOfDay }] },
      exceptions: [],
    };

    const { proposals, conflicts } = generator.generate(
      input(autoConfig(), [G1, G2], centerHours, { availabilityByTeacher: new Map([[TEACHER, rules]]) }),
    );

    expect(blockTimes(proposals, G1)).toEqual([{ start: '19:00', end: '20:30' }]);
    expect(blockTimes(proposals, G2)).toEqual([{ start: '20:30', end: '22:00' }]);
    expect(proposals.find((p) => p.groupId === G1)!.requestedSessionsPerWeek).toBe(1);
    expect(proposals.find((p) => p.groupId === G2)!.requestedSessionsPerWeek).toBe(1);
    expect(conflicts).toEqual([]);
  });

  it('a third group that genuinely cannot fit is flagged with a teacher double-book, not silently dropped', () => {
    const generator = new SessionGenerator(fakeRandom());
    // 19:00–22:00 holds exactly two 90-minute sessions; a third has nowhere free.
    const centerHours: readonly DayHours[] = [
      { dayOfWeek: MON, windows: [{ open: '19:00' as TimeOfDay, close: '22:00' as TimeOfDay }] },
    ];
    const rules: TeacherAvailabilityRules = {
      weeklyWindows: { ...emptyWeek(), [MON]: [{ open: '19:00' as TimeOfDay, close: '22:00' as TimeOfDay }] },
      exceptions: [],
    };

    const { proposals, conflicts } = generator.generate(
      // Three rooms, so this exercises the teacher-time constraint specifically
      // — not the unrelated SOU-261 room-count fail-fast (a separate, pre-existing
      // conservative guard, out of scope for this fix).
      input(autoConfig(), [G1, G2, G3], centerHours, {
        availabilityByTeacher: new Map([[TEACHER, rules]]),
        rooms: [ROOM_A, ROOM_B, ROOM_C],
      }),
    );

    expect(blockTimes(proposals, G1)).toEqual([{ start: '19:00', end: '20:30' }]);
    expect(blockTimes(proposals, G2)).toEqual([{ start: '20:30', end: '22:00' }]);
    expect(blockTimes(proposals, G3)).toEqual([{ start: '19:00', end: '20:30' }]);
    expect(conflicts.some((c) => c.kind === 'teacher' && c.groupId === G3)).toBe(true);
  });
});
