import { describe, it, expect, beforeEach } from 'vitest';
import {
  AuditSessionsOutsideEffectiveHours,
  type SessionAuditReason,
  type StrandedSession,
} from '../../../src/use-cases/audit-sessions-outside-effective-hours';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { SessionId } from '../../../src/entities/session';
import type { WeeklyRecurringSessionId } from '../../../src/entities/weekly-recurring-session';
import type { SessionOccurrenceView } from '../../../src/read-models/session-occurrence-view';
import type { CenterHours, CenterHoursId } from '../../../src/entities/center-hours';
import type { Holiday, HolidayId } from '../../../src/entities/holiday';
import type { Enrollment, EnrollmentId } from '../../../src/entities/enrollment';
import type {
  CenterHoursOverride,
  CenterHoursOverrideId,
  WeeklyTimeWindows,
} from '../../../src/entities/center-hours-override';
import type { TimeWindow } from '../../../src/value-objects/time-window';
import type { RoomId } from '../../../src/entities/room';
import type { GroupId } from '../../../src/entities/group';
import type { SubjectId } from '../../../src/entities/subject';
import type { StudentId } from '../../../src/entities/student';
import type { TeacherId } from '../../../src/entities/teacher';
import type {
  TeacherAvailability,
  TeacherAvailabilityId,
} from '../../../src/entities/teacher-availability';
import type {
  TeacherAvailabilityException,
  TeacherAvailabilityExceptionId,
} from '../../../src/entities/teacher-availability-exception';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import { InMemorySessionOccurrenceViewReadPort } from '../fakes/in-memory-session-occurrence-view-read-port';
import { InMemoryHolidayRepository } from '../fakes/in-memory-holiday-repository';
import { InMemoryCenterHoursRepository } from '../fakes/in-memory-center-hours-repository';
import { InMemoryCenterHoursOverrideRepository } from '../fakes/in-memory-center-hours-override-repository';
import { InMemoryTeacherAvailabilityRepository } from '../fakes/in-memory-teacher-availability-repository';
import { InMemoryTeacherAvailabilityExceptionRepository } from '../fakes/in-memory-teacher-availability-exception-repository';
import { InMemoryEnrollmentRepository } from '../fakes/in-memory-enrollment-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const ROOM = 'rom_00000000000000000000000001' as RoomId;
const GROUP = 'grp_00000000000000000000000001' as GroupId;
const SUBJECT = 'sub_00000000000000000000000001' as SubjectId;
const TEACHER = 'tch_00000000000000000000000001' as EntityId;
const WRS_ID = 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId;

// Every seeded date falls on a Thursday (weekday 4): 2026-01-01, -08, -15, -22, -29.
const THURSDAY: WeekdayIndex = 4;
const CLOSED: readonly TimeWindow[] = [];

let sessionSeq = 0;
function occurrence(over: Partial<SessionOccurrenceView> & Pick<SessionOccurrenceView, 'date'>): SessionOccurrenceView {
  sessionSeq += 1;
  const id = `ses_${String(sessionSeq).padStart(26, '0')}` as SessionId;
  return {
    id,
    recurringSessionId: WRS_ID,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    roomId: ROOM,
    roomName: 'Salle 1',
    roomCapacity: 20,
    roomArchived: false,
    teacherId: null,
    teacherName: null,
    groupId: GROUP,
    subjectId: SUBJECT,
    subjectName: { fr: 'Maths', ar: 'رياضيات' },
    level: '2e Bac',
    kind: 'regular',
    ...over,
  };
}

function thursdayHours(open: string, close: string): CenterHours {
  return {
    id: 'chr_00000000000000000000000004' as CenterHoursId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    dayOfWeek: THURSDAY,
    windows: [{ open: open as TimeOfDay, close: close as TimeOfDay }],
  };
}

function holiday(date: string): Holiday {
  return {
    id: 'hol_00000000000000000000000001' as HolidayId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    name: { fr: 'Jour férié', ar: 'عيد' },
    kind: 'fixed',
    startDate: date,
    endDate: date,
    affectsInvoicing: false,
  };
}

function override(hoursByWeekday: WeeklyTimeWindows): CenterHoursOverride {
  return {
    id: 'cho_00000000000000000000000001' as CenterHoursOverrideId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    dateRange: { start: '2026-01-20', end: '2026-01-31' },
    hoursByWeekday,
  };
}

function thursdayOverride(windows: readonly TimeWindow[]): CenterHoursOverride {
  return override({
    0: CLOSED, 1: CLOSED, 2: CLOSED, 3: CLOSED,
    4: windows,
    5: CLOSED, 6: CLOSED,
  });
}

function weekWindows(byDay: Partial<Record<WeekdayIndex, readonly TimeWindow[]>>): WeeklyTimeWindows {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], ...byDay } as WeeklyTimeWindows;
}

function seededAvailability(weeklyWindows: WeeklyTimeWindows): TeacherAvailability {
  return {
    id: 'tav_00000000000000000000000001' as TeacherAvailabilityId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    teacherId: TEACHER as string as TeacherId,
    weeklyWindows,
  };
}

function seededException(date: string): TeacherAvailabilityException {
  return {
    id: 'tae_00000000000000000000000001' as TeacherAvailabilityExceptionId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    teacherId: TEACHER as string as TeacherId,
    dateRange: { start: date, end: date },
    label: null,
  };
}

let enrollmentSeq = 0;
function makeEnrollment(groupId: GroupId): Enrollment {
  enrollmentSeq += 1;
  const suffix = String(enrollmentSeq).padStart(26, '0');
  return {
    id: `enr_${suffix}` as EnrollmentId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    studentId: `stu_${suffix}` as StudentId,
    groupId,
    startMonth: '2026-01',
    endMonth: null,
  };
}

/** Flatten the grouped result back to per-occurrence rows for the flat assertions
 *  (deduped by session id — a multi-reason occurrence appears in one bucket per
 *  reason, but its `reasons` array is identical in every one). */
function flat(groups: readonly { occurrences: readonly StrandedSession[] }[]): readonly StrandedSession[] {
  const seen = new Map<string, StrandedSession>();
  for (const group of groups) {
    for (const item of group.occurrences) {
      if (!seen.has(item.session.id)) seen.set(item.session.id, item);
    }
  }
  return [...seen.values()];
}

describe('AuditSessionsOutsideEffectiveHours', () => {
  let occurrences: InMemorySessionOccurrenceViewReadPort;
  let holidays: InMemoryHolidayRepository;
  let centerHours: InMemoryCenterHoursRepository;
  let overrides: InMemoryCenterHoursOverrideRepository;
  let availability: InMemoryTeacherAvailabilityRepository;
  let availabilityExceptions: InMemoryTeacherAvailabilityExceptionRepository;
  let enrollments: InMemoryEnrollmentRepository;

  function build(
    plan: Plan = PLANS.essentiel,
    clock = fakeClock('2026-01-01T00:00:00Z'),
  ): AuditSessionsOutsideEffectiveHours {
    return new AuditSessionsOutsideEffectiveHours({
      occurrences,
      enrollments,
      holidays,
      centerHours,
      overrides,
      availability,
      availabilityExceptions,
      plan: new PlanPolicy(plan),
      clock,
    });
  }

  beforeEach(async () => {
    sessionSeq = 0;
    enrollmentSeq = 0;
    occurrences = new InMemorySessionOccurrenceViewReadPort();
    holidays = new InMemoryHolidayRepository();
    centerHours = new InMemoryCenterHoursRepository();
    overrides = new InMemoryCenterHoursOverrideRepository();
    availability = new InMemoryTeacherAvailabilityRepository();
    availabilityExceptions = new InMemoryTeacherAvailabilityExceptionRepository();
    enrollments = new InMemoryEnrollmentRepository();
    await centerHours.save(thursdayHours('09:00', '12:00'));
  });

  describe('happy path', () => {
    it('flags nothing when every live occurrence fits its effective window', async () => {
      occurrences.seed(occurrence({ date: '2026-01-01', start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay }));
      occurrences.seed(occurrence({ date: '2026-01-08', start: '10:30' as TimeOfDay, end: '12:00' as TimeOfDay }));
      const result = await build().execute({ centerCode: CENTER });
      expect(result.groups).toEqual([]);
    });

    it('imposes no hours constraint on a weekday the center never configured', async () => {
      occurrences.seed(occurrence({ date: '2026-01-02', start: '13:00' as TimeOfDay, end: '14:00' as TimeOfDay }));
      const result = await build().execute({ centerCode: CENTER });
      expect(result.groups).toEqual([]);
    });
  });

  describe('stranded reasons (table-driven)', () => {
    type Case = {
      readonly name: string;
      readonly seed: () => Promise<SessionOccurrenceView>;
      readonly reason: SessionAuditReason;
    };

    const cases: readonly Case[] = [
      {
        name: 'an occurrence now sitting after static closing time',
        reason: 'outside-center-hours',
        seed: async () => {
          const stranded = occurrence({ date: '2026-01-08', start: '13:00' as TimeOfDay, end: '14:00' as TimeOfDay });
          occurrences.seed(stranded);
          return stranded;
        },
      },
      {
        name: 'an occurrence on a date a newly-added holiday now covers',
        reason: 'on-holiday',
        seed: async () => {
          const stranded = occurrence({ date: '2026-01-15' });
          occurrences.seed(stranded);
          await holidays.save(holiday('2026-01-15'));
          return stranded;
        },
      },
      {
        name: 'an occurrence a center-hours override now closes that weekday',
        reason: 'outside-center-hours',
        seed: async () => {
          const stranded = occurrence({ date: '2026-01-22' });
          occurrences.seed(stranded);
          await overrides.save(thursdayOverride(CLOSED));
          return stranded;
        },
      },
      {
        name: 'an occurrence a center-hours override now re-times outside its window',
        reason: 'outside-center-hours',
        seed: async () => {
          const stranded = occurrence({ date: '2026-01-22' });
          occurrences.seed(stranded);
          await overrides.save(
            thursdayOverride([{ open: '12:00' as TimeOfDay, close: '15:00' as TimeOfDay }]),
          );
          return stranded;
        },
      },
      {
        name: 'an occurrence whose room was archived after generation',
        reason: 'room-archived',
        seed: async () => {
          const stranded = occurrence({ date: '2026-01-08', roomArchived: true });
          occurrences.seed(stranded);
          return stranded;
        },
      },
    ];

    it.each(cases)('flags $name as $reason', async ({ seed, reason }) => {
      const stranded = await seed();
      const result = await build().execute({ centerCode: CENTER });
      expect(flat(result.groups)).toEqual([{ session: stranded, reasons: [reason] }]);
    });
  });

  describe('room over-capacity (soft warning)', () => {
    it('flags an occurrence whose room seats fewer than the group live enrollment', async () => {
      const stranded = occurrence({ date: '2026-01-08', roomCapacity: 5 });
      occurrences.seed(stranded);
      for (let i = 0; i < 8; i += 1) await enrollments.save(makeEnrollment(GROUP));
      const result = await build().execute({ centerCode: CENTER });
      expect(flat(result.groups)).toEqual([{ session: stranded, reasons: ['room-over-capacity'] }]);
    });

    it('does not flag a room that still seats the whole group', async () => {
      const stranded = occurrence({ date: '2026-01-08', roomCapacity: 8 });
      occurrences.seed(stranded);
      for (let i = 0; i < 8; i += 1) await enrollments.save(makeEnrollment(GROUP));
      const result = await build().execute({ centerCode: CENTER });
      expect(result.groups).toEqual([]);
    });
  });

  describe('double-book detection', () => {
    it('flags two same-date, same-room overlapping occurrences as room-double-booked', async () => {
      const first = occurrence({ date: '2026-01-08', start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay });
      const second = occurrence({ date: '2026-01-08', start: '10:00' as TimeOfDay, end: '11:00' as TimeOfDay });
      occurrences.seed(first);
      occurrences.seed(second);
      const result = await build().execute({ centerCode: CENTER });
      const rows = flat(result.groups);
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.reasons.includes('room-double-booked'))).toBe(true);
    });

    it('does not flag two occurrences of the same weekday on different dates', async () => {
      occurrences.seed(occurrence({ date: '2026-01-08', start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay }));
      occurrences.seed(occurrence({ date: '2026-01-15', start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay }));
      const result = await build().execute({ centerCode: CENTER });
      expect(result.groups).toEqual([]);
    });
  });

  describe('grouping', () => {
    it('collapses eight weekly over-capacity rows into one bucket with count 8', async () => {
      // Eight consecutive Thursdays (weekday 4), all in the same room — one bucket.
      const thursdays = ['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22', '2026-01-29', '2026-02-05', '2026-02-12', '2026-02-19'];
      for (const date of thursdays) {
        occurrences.seed(occurrence({ date, roomCapacity: 5 }));
      }
      for (let i = 0; i < 8; i += 1) await enrollments.save(makeEnrollment(GROUP));
      const result = await build().execute({ centerCode: CENTER });
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]?.reason).toBe('room-over-capacity');
      expect(result.groups[0]?.count).toBe(8);
    });
  });

  describe('isolation', () => {
    it('carries the enriched display fields (subject/room/level) on each stranded row', async () => {
      const stranded = occurrence({ date: '2026-01-08', start: '13:00' as TimeOfDay, end: '14:00' as TimeOfDay });
      occurrences.seed(stranded);

      const [row] = flat((await build().execute({ centerCode: CENTER })).groups);
      expect(row?.session.subjectName).toEqual({ fr: 'Maths', ar: 'رياضيات' });
      expect(row?.session.roomName).toBe('Salle 1');
      expect(row?.session.level).toBe('2e Bac');
    });

    it('returns only the stranded occurrences, never the in-window ones alongside them', async () => {
      const fits = occurrence({ date: '2026-01-01', start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay });
      const stranded = occurrence({ date: '2026-01-08', start: '13:00' as TimeOfDay, end: '14:00' as TimeOfDay });
      occurrences.seed(fits);
      occurrences.seed(stranded);

      const result = await build().execute({ centerCode: CENTER });
      expect(flat(result.groups)).toEqual([
        { session: stranded, reasons: ['outside-center-hours'] },
      ]);
    });

    it('excludes an already soft-deleted (cancelled) occurrence even when it is out of hours', async () => {
      const cancelled = occurrence({ date: '2026-01-29', start: '13:00' as TimeOfDay, end: '14:00' as TimeOfDay });
      occurrences.seed(cancelled);
      occurrences.softDelete(cancelled.id);

      const result = await build().execute({ centerCode: CENTER });
      expect(result.groups).toEqual([]);
    });

    it('reports both on-holiday and outside-center-hours when both apply (no precedence)', async () => {
      const both = occurrence({ date: '2026-01-15', start: '13:00' as TimeOfDay, end: '14:00' as TimeOfDay });
      occurrences.seed(both);
      await holidays.save(holiday('2026-01-15'));

      const result = await build().execute({ centerCode: CENTER });
      expect(flat(result.groups)).toEqual([
        { session: both, reasons: ['on-holiday', 'outside-center-hours'] },
      ]);
    });
  });

  describe('teacher availability (SOU-283)', () => {
    const noAvailabilityPlan: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(['settings.center-hours']),
      limits: PLANS.essentiel.limits,
    };

    it('flags a teacher scheduled on their whole-week-off as outside-teacher-availability', async () => {
      const stranded = occurrence({ date: '2026-01-08', teacherId: TEACHER });
      occurrences.seed(stranded);
      await availability.save(seededAvailability(weekWindows({})));
      const result = await build().execute({ centerCode: CENTER });
      expect(flat(result.groups)).toEqual([
        { session: stranded, reasons: ['outside-teacher-availability'] },
      ]);
    });

    it('flags an occurrence outside the teacher window even while inside center hours', async () => {
      const stranded = occurrence({ date: '2026-01-08', teacherId: TEACHER });
      occurrences.seed(stranded);
      await availability.save(
        seededAvailability(weekWindows({ 4: [{ open: '09:00' as TimeOfDay, close: '10:00' as TimeOfDay }] })),
      );
      const result = await build().execute({ centerCode: CENTER });
      expect(flat(result.groups)).toEqual([
        { session: stranded, reasons: ['outside-teacher-availability'] },
      ]);
    });

    it('flags a teacher on a one-off absence date', async () => {
      const stranded = occurrence({ date: '2026-01-08', teacherId: TEACHER });
      occurrences.seed(stranded);
      await availability.save(
        seededAvailability(weekWindows({ 4: [{ open: '09:00' as TimeOfDay, close: '12:00' as TimeOfDay }] })),
      );
      await availabilityExceptions.save(seededException('2026-01-08'));
      const result = await build().execute({ centerCode: CENTER });
      expect(flat(result.groups)).toEqual([
        { session: stranded, reasons: ['outside-teacher-availability'] },
      ]);
    });

    it('does not flag an in-window teacher occurrence', async () => {
      occurrences.seed(occurrence({ date: '2026-01-08', teacherId: TEACHER }));
      await availability.save(
        seededAvailability(weekWindows({ 4: [{ open: '09:00' as TimeOfDay, close: '12:00' as TimeOfDay }] })),
      );
      const result = await build().execute({ centerCode: CENTER });
      expect(result.groups).toEqual([]);
    });

    it('does not flag a teacher with no configured availability row (unrestricted)', async () => {
      occurrences.seed(occurrence({ date: '2026-01-08', teacherId: TEACHER }));
      const result = await build().execute({ centerCode: CENTER });
      expect(result.groups).toEqual([]);
    });

    it('never surfaces the availability reason when the plan lacks planning.teacher-availability', async () => {
      occurrences.seed(occurrence({ date: '2026-01-08', teacherId: TEACHER }));
      await availability.save(seededAvailability(weekWindows({})));
      const result = await build(noAvailabilityPlan).execute({ centerCode: CENTER });
      expect(result.groups).toEqual([]);
    });

    it('reports both outside-center-hours and outside-teacher-availability when both apply', async () => {
      const both = occurrence({ date: '2026-01-08', teacherId: TEACHER, start: '13:00' as TimeOfDay, end: '14:00' as TimeOfDay });
      occurrences.seed(both);
      await availability.save(seededAvailability(weekWindows({})));
      const result = await build().execute({ centerCode: CENTER });
      expect(flat(result.groups)).toEqual([
        { session: both, reasons: ['outside-center-hours', 'outside-teacher-availability'] },
      ]);
    });
  });

  describe('today-forward floor', () => {
    it('excludes a past stranded occurrence but keeps a same-shape one dated today', async () => {
      const past = occurrence({ date: '2025-12-25', start: '13:00' as TimeOfDay, end: '14:00' as TimeOfDay });
      const todayStranded = occurrence({ date: '2026-01-01', start: '13:00' as TimeOfDay, end: '14:00' as TimeOfDay });
      occurrences.seed(past);
      occurrences.seed(todayStranded);

      const result = await build(
        PLANS.essentiel,
        fakeClock('2026-01-01T08:00:00Z'),
      ).execute({ centerCode: CENTER });

      expect(flat(result.groups)).toEqual([
        { session: todayStranded, reasons: ['outside-center-hours'] },
      ]);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks settings.center-hours', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(build(planWithout).execute({ centerCode: CENTER })).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });
  });
});
