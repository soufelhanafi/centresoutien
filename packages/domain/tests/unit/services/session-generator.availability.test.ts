import { describe, it, expect } from 'vitest';
import {
  SessionGenerator,
  type SessionGeneratorConfig,
  type SessionGenerationInput,
} from '../../../src/services/session-generator';
import type { TeacherAvailabilityRules } from '../../../src/policies/teacher-availability-policy';
import type { DayHours } from '../../../src/policies/session-conflict-policy';
import type { WeeklyTimeWindows } from '../../../src/entities/center-hours-override';
import type { GroupId } from '../../../src/entities/group';
import type { RoomId } from '../../../src/entities/room';
import type { EntityId } from '../../../src/value-objects/ids';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { TimeWindow } from '../../../src/value-objects/time-window';
import { fakeRandom } from '../fakes/random';

const SUN = 0 as WeekdayIndex;
const MON = 1 as WeekdayIndex;
const TUE = 2 as WeekdayIndex;
const WED = 3 as WeekdayIndex;
const THU = 4 as WeekdayIndex;
const FRI = 5 as WeekdayIndex;
const SAT = 6 as WeekdayIndex;

const G1 = 'grp_00000000000000000000000001' as GroupId;
const ROOM_A = 'rom_00000000000000000000000001' as RoomId;
const TEACHER_1 = 'tch_00000000000000000000000001' as EntityId;

const centerHours: readonly DayHours[] = [
  { dayOfWeek: SUN, windows: [] },
  ...[MON, TUE, WED, THU, FRI, SAT].map((dayOfWeek) => ({
    dayOfWeek,
    windows: [{ open: '09:00' as TimeOfDay, close: '18:00' as TimeOfDay }],
  })),
];

const window = (open: string, close: string): TimeWindow => ({
  open: open as TimeOfDay,
  close: close as TimeOfDay,
});

const emptyWeek = (): WeeklyTimeWindows => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });

function autoConfig(over: Partial<SessionGeneratorConfig> = {}): SessionGeneratorConfig {
  return {
    scope: { groups: 'all', teachers: 'all' },
    kind: 'regular',
    weekdayPool: [MON, TUE, WED, THU, FRI, SAT],
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
  availabilityByTeacher?: ReadonlyMap<EntityId, TeacherAvailabilityRules>,
): SessionGenerationInput {
  return {
    config,
    groups: [G1],
    teacherByGroup: new Map([[G1, TEACHER_1]]),
    rooms: [ROOM_A],
    centerHours,
    existingSchedule: [],
    ...(availabilityByTeacher === undefined ? {} : { availabilityByTeacher }),
  };
}

function blockDays(proposal: { blocks: readonly { block: { dayOfWeek: WeekdayIndex } }[] }): readonly WeekdayIndex[] {
  return proposal.blocks.map((scheduled) => scheduled.block.dayOfWeek);
}

describe('SessionGenerator — teacher availability (SOU-259)', () => {
  it('steers the auto day search onto the teacher’s available weekdays', () => {
    const generator = new SessionGenerator(fakeRandom());
    // Identity shuffle would commit {Mon, Wed}; the teacher only works Tue + Thu mornings.
    const rules: TeacherAvailabilityRules = {
      weeklyWindows: { ...emptyWeek(), [TUE]: [window('09:00', '12:00')], [THU]: [window('09:00', '12:00')] },
      exceptions: [],
    };

    const { proposals, conflicts } = generator.generate(
      input(autoConfig(), new Map([[TEACHER_1, rules]])),
    );

    expect([...blockDays(proposals[0]!)].sort((a, b) => a - b)).toEqual([TUE, THU]);
    expect(conflicts).toEqual([]);
  });

  it('falls back and flags when no weekday combo fits the availability', () => {
    const generator = new SessionGenerator(fakeRandom());
    // Two sessions a week, but the teacher only ever works Tuesday: every combo clashes.
    const rules: TeacherAvailabilityRules = {
      weeklyWindows: { ...emptyWeek(), [TUE]: [window('09:00', '12:00')] },
      exceptions: [],
    };

    const { proposals, conflicts } = generator.generate(
      input(autoConfig(), new Map([[TEACHER_1, rules]])),
    );

    expect(proposals[0]!.blocks).toHaveLength(2);
    expect(conflicts.some((c) => c.kind === 'teacher-availability')).toBe(true);
  });

  it('custom mode flags an off-day pick without blocking it', () => {
    const generator = new SessionGenerator(fakeRandom());
    const config = autoConfig({
      mode: 'custom',
      pickedWeekdays: [MON],
      sessionsPerWeek: 1,
      minGapDays: 1,
    } as Partial<SessionGeneratorConfig>);
    const rules: TeacherAvailabilityRules = { weeklyWindows: emptyWeek(), exceptions: [] };

    const { proposals, conflicts } = generator.generate(input(config, new Map([[TEACHER_1, rules]])));

    expect(proposals[0]!.blocks).toHaveLength(1);
    const availabilityConflicts = conflicts.filter((c) => c.kind === 'teacher-availability');
    expect(availabilityConflicts).toHaveLength(1);
    expect(availabilityConflicts[0]!.error.reason).toBe('out-of-window');
  });

  it('a teacher absent from the rules map is unrestricted', () => {
    const generator = new SessionGenerator(fakeRandom());

    const { conflicts } = generator.generate(
      input(autoConfig(), new Map<EntityId, TeacherAvailabilityRules>()),
    );

    expect(conflicts).toEqual([]);
  });

  it('flags a one-off absence covering the run, even with no weekly pattern', () => {
    const generator = new SessionGenerator(fakeRandom());
    const config = autoConfig({
      mode: 'custom',
      pickedWeekdays: [MON],
      sessionsPerWeek: 1,
      minGapDays: 1,
    } as Partial<SessionGeneratorConfig>);
    const rules: TeacherAvailabilityRules = {
      weeklyWindows: null,
      exceptions: [{ start: '2026-10-01', end: '2026-10-15' }],
    };

    const { conflicts } = generator.generate(input(config, new Map([[TEACHER_1, rules]])));

    const availabilityConflicts = conflicts.filter((c) => c.kind === 'teacher-availability');
    expect(availabilityConflicts).toHaveLength(1);
    expect(availabilityConflicts[0]!.error.reason).toBe('exception');
  });
});
