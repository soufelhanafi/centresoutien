import { describe, it, expect, beforeEach } from 'vitest';
import {
  AuditSessionsOutsideEffectiveHours,
  type SessionAuditReason,
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
import type {
  CenterHoursOverride,
  CenterHoursOverrideId,
  WeeklyTimeWindows,
} from '../../../src/entities/center-hours-override';
import type { TimeWindow } from '../../../src/value-objects/time-window';
import type { RoomId } from '../../../src/entities/room';
import type { GroupId } from '../../../src/entities/group';
import type { SubjectId } from '../../../src/entities/subject';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import { InMemorySessionOccurrenceViewReadPort } from '../fakes/in-memory-session-occurrence-view-read-port';
import { InMemoryHolidayRepository } from '../fakes/in-memory-holiday-repository';
import { InMemoryCenterHoursRepository } from '../fakes/in-memory-center-hours-repository';
import { InMemoryCenterHoursOverrideRepository } from '../fakes/in-memory-center-hours-override-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const ROOM = 'rom_00000000000000000000000001' as RoomId;
const GROUP = 'grp_00000000000000000000000001' as GroupId;
const SUBJECT = 'sub_00000000000000000000000001' as SubjectId;
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
    open: open as TimeOfDay,
    close: close as TimeOfDay,
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

describe('AuditSessionsOutsideEffectiveHours', () => {
  let occurrences: InMemorySessionOccurrenceViewReadPort;
  let holidays: InMemoryHolidayRepository;
  let centerHours: InMemoryCenterHoursRepository;
  let overrides: InMemoryCenterHoursOverrideRepository;

  function build(plan: Plan = PLANS.essentiel): AuditSessionsOutsideEffectiveHours {
    return new AuditSessionsOutsideEffectiveHours(
      occurrences,
      holidays,
      centerHours,
      overrides,
      new PlanPolicy(plan),
    );
  }

  beforeEach(async () => {
    sessionSeq = 0;
    occurrences = new InMemorySessionOccurrenceViewReadPort();
    holidays = new InMemoryHolidayRepository();
    centerHours = new InMemoryCenterHoursRepository();
    overrides = new InMemoryCenterHoursOverrideRepository();
    // Baseline: the center opens Thursdays 09:00–12:00.
    await centerHours.save(thursdayHours('09:00', '12:00'));
  });

  describe('happy path', () => {
    it('flags nothing when every live occurrence fits its effective window', async () => {
      occurrences.seed(occurrence({ date: '2026-01-01', start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay }));
      occurrences.seed(occurrence({ date: '2026-01-08', start: '10:30' as TimeOfDay, end: '12:00' as TimeOfDay }));
      const result = await build().execute({ centerCode: CENTER });
      expect(result.sessionsOutsideEffectiveHours).toEqual([]);
    });

    it('imposes no hours constraint on a weekday the center never configured', async () => {
      // 2026-01-02 is a Friday (weekday 5); no Friday hours row and no override →
      // resolveEffectiveWindows returns null, so the occurrence is never flagged.
      occurrences.seed(occurrence({ date: '2026-01-02', start: '13:00' as TimeOfDay, end: '14:00' as TimeOfDay }));
      const result = await build().execute({ centerCode: CENTER });
      expect(result.sessionsOutsideEffectiveHours).toEqual([]);
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
          const stranded = occurrence({
            date: '2026-01-08',
            start: '13:00' as TimeOfDay,
            end: '14:00' as TimeOfDay,
          });
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
          // Override opens Thursdays 12:00–15:00; the 09:00 slot no longer fits.
          await overrides.save(
            thursdayOverride([{ open: '12:00' as TimeOfDay, close: '15:00' as TimeOfDay }]),
          );
          return stranded;
        },
      },
    ];

    it.each(cases)('flags $name as $reason', async ({ seed, reason }) => {
      const stranded = await seed();
      const result = await build().execute({ centerCode: CENTER });
      expect(result.sessionsOutsideEffectiveHours).toEqual([{ session: stranded, reason }]);
    });
  });

  describe('isolation', () => {
    it('carries the enriched display fields (subject/room/level) on each stranded row', async () => {
      const stranded = occurrence({
        date: '2026-01-08',
        start: '13:00' as TimeOfDay,
        end: '14:00' as TimeOfDay,
      });
      occurrences.seed(stranded);

      const [row] = (await build().execute({ centerCode: CENTER })).sessionsOutsideEffectiveHours;
      expect(row?.session.subjectName).toEqual({ fr: 'Maths', ar: 'رياضيات' });
      expect(row?.session.roomName).toBe('Salle 1');
      expect(row?.session.level).toBe('2e Bac');
    });

    it('returns only the stranded occurrences, never the in-window ones alongside them', async () => {
      const fits = occurrence({
        date: '2026-01-01',
        start: '09:00' as TimeOfDay,
        end: '10:30' as TimeOfDay,
      });
      const stranded = occurrence({
        date: '2026-01-08',
        start: '13:00' as TimeOfDay,
        end: '14:00' as TimeOfDay,
      });
      occurrences.seed(fits);
      occurrences.seed(stranded);

      const result = await build().execute({ centerCode: CENTER });
      expect(result.sessionsOutsideEffectiveHours).toEqual([
        { session: stranded, reason: 'outside-center-hours' },
      ]);
    });

    it('excludes an already soft-deleted (cancelled) occurrence even when it is out of hours', async () => {
      const cancelled = occurrence({
        date: '2026-01-29',
        start: '13:00' as TimeOfDay,
        end: '14:00' as TimeOfDay,
      });
      occurrences.seed(cancelled);
      occurrences.softDelete(cancelled.id);

      const result = await build().execute({ centerCode: CENTER });
      expect(result.sessionsOutsideEffectiveHours).toEqual([]);
    });

    it('prefers on-holiday over outside-center-hours when both apply to one occurrence', async () => {
      const both = occurrence({
        date: '2026-01-15',
        start: '13:00' as TimeOfDay,
        end: '14:00' as TimeOfDay,
      });
      occurrences.seed(both);
      await holidays.save(holiday('2026-01-15'));

      const result = await build().execute({ centerCode: CENTER });
      expect(result.sessionsOutsideEffectiveHours).toEqual([
        { session: both, reason: 'on-holiday' },
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
