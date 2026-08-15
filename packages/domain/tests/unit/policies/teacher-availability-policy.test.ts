import { describe, it, expect } from 'vitest';
import {
  teacherUnavailability,
  weekdayOccursWithin,
  type TeacherAvailabilityRules,
} from '../../../src/policies/teacher-availability-policy';
import { TeacherUnavailableError } from '../../../src/errors/teacher-availability-errors';
import type { SessionTimeCandidate } from '../../../src/policies/session-conflict-policy';
import type { WeeklyTimeWindows } from '../../../src/entities/center-hours-override';
import type { TimeWindow } from '../../../src/value-objects/time-window';
import type { DateRange } from '../../../src/value-objects/date-range';
import type { EntityId } from '../../../src/value-objects/ids';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';

const MON = 1 as WeekdayIndex;
const TEACHER = 'tch_00000000000000000000000001' as EntityId;

// September 2026: Tue 1st … Sun 6th, Mon 7th, Mon 14th, …
const RUN_RANGE: DateRange = { start: '2026-09-01', end: '2026-12-31' };

const window = (open: string, close: string): TimeWindow => ({
  open: open as TimeOfDay,
  close: close as TimeOfDay,
});

const emptyWeek = (): WeeklyTimeWindows => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });

function candidate(start: string, end: string, dayOfWeek: WeekdayIndex = MON): SessionTimeCandidate {
  return { dayOfWeek, start: start as TimeOfDay, end: end as TimeOfDay };
}

function rules(over: Partial<TeacherAvailabilityRules> = {}): TeacherAvailabilityRules {
  return { weeklyWindows: null, exceptions: [], ...over };
}

describe('weekdayOccursWithin', () => {
  const cases = [
    { name: 'absence on exactly one matching weekday', absence: { start: '2026-09-07', end: '2026-09-07' }, expected: true },
    { name: 'short absence missing the weekday (Tue–Thu vs Monday)', absence: { start: '2026-09-08', end: '2026-09-10' }, expected: false },
    { name: 'seven-day absence always contains the weekday', absence: { start: '2026-09-08', end: '2026-09-14' }, expected: true },
    { name: 'absence entirely outside the range', absence: { start: '2027-01-01', end: '2027-01-15' }, expected: false },
    { name: 'intersection starts on the weekday itself', absence: { start: '2026-08-01', end: '2026-09-07' }, expected: true },
  ] as const;

  it.each(cases)('$name', ({ absence, expected }) => {
    expect(weekdayOccursWithin(MON, RUN_RANGE, absence)).toBe(expected);
  });

  it('clips the absence to the run range before aligning to the weekday', () => {
    // Absence spans Tue 1st – Thu 10th, but the run only starts Wed 9th: the
    // clipped overlap (Wed 9th – Thu 10th) holds no Monday.
    const lateStart: DateRange = { start: '2026-09-09', end: '2026-12-31' };
    expect(weekdayOccursWithin(MON, lateStart, { start: '2026-09-01', end: '2026-09-10' })).toBe(false);
  });
});

describe('teacherUnavailability', () => {
  it('returns null when the block sits inside a weekly window', () => {
    const weekly = { ...emptyWeek(), [MON]: [window('09:00', '12:00')] };
    expect(
      teacherUnavailability(candidate('09:00', '10:30'), TEACHER, rules({ weeklyWindows: weekly }), RUN_RANGE),
    ).toBeNull();
  });

  it('flags out-of-window when the block misses every window of its weekday', () => {
    const weekly = { ...emptyWeek(), [MON]: [window('14:00', '16:00')] };
    const error = teacherUnavailability(
      candidate('09:00', '10:30'),
      TEACHER,
      rules({ weeklyWindows: weekly }),
      RUN_RANGE,
    );
    expect(error).toBeInstanceOf(TeacherUnavailableError);
    expect(error?.reason).toBe('out-of-window');
    expect(error?.windows).toEqual([window('14:00', '16:00')]);
  });

  it('treats an empty weekday list as a whole day off', () => {
    const error = teacherUnavailability(
      candidate('09:00', '10:30'),
      TEACHER,
      rules({ weeklyWindows: emptyWeek() }),
      RUN_RANGE,
    );
    expect(error?.reason).toBe('out-of-window');
    expect(error?.windows).toEqual([]);
  });

  it('returns null with no weekly pattern and no exceptions', () => {
    expect(teacherUnavailability(candidate('09:00', '10:30'), TEACHER, rules(), RUN_RANGE)).toBeNull();
  });

  it('flags an exception covering an occurrence date, with no weekly pattern', () => {
    const absence: DateRange = { start: '2026-09-07', end: '2026-09-07' };
    const error = teacherUnavailability(
      candidate('09:00', '10:30'),
      TEACHER,
      rules({ exceptions: [absence] }),
      RUN_RANGE,
    );
    expect(error?.reason).toBe('exception');
    expect(error?.exception).toEqual(absence);
  });

  it('ignores an exception whose overlap holds no occurrence of the weekday', () => {
    expect(
      teacherUnavailability(
        candidate('09:00', '10:30'),
        TEACHER,
        rules({ exceptions: [{ start: '2026-09-08', end: '2026-09-10' }] }),
        RUN_RANGE,
      ),
    ).toBeNull();
  });

  it('skips the exception check entirely when no materialization range is given', () => {
    expect(
      teacherUnavailability(
        candidate('09:00', '10:30'),
        TEACHER,
        rules({ exceptions: [{ start: '2026-09-07', end: '2026-09-07' }] }),
        null,
      ),
    ).toBeNull();
  });

  it('reports out-of-window before an exception when both apply', () => {
    const weekly = { ...emptyWeek(), [MON]: [window('14:00', '16:00')] };
    const error = teacherUnavailability(
      candidate('09:00', '10:30'),
      TEACHER,
      rules({ weeklyWindows: weekly, exceptions: [{ start: '2026-09-07', end: '2026-09-07' }] }),
      RUN_RANGE,
    );
    expect(error?.reason).toBe('out-of-window');
  });
});
