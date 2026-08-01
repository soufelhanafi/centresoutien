import { describe, it, expect } from 'vitest';
import {
  GenerateSessions,
  type GenerateSessionsInput,
} from '../../../src/use-cases/generate-sessions';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from '../../../src/entities/weekly-recurring-session';
import type { HolidayOccurrence } from '../../../src/policies/holiday-policy';
import type { HolidayId } from '../../../src/entities/holiday';
import type { RoomId } from '../../../src/entities/room';
import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import { weekdayOf } from '../../../src/value-objects/date-range';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const CLOCK_ISO = '2026-01-01T08:00:00Z';

// 2026-01-01 is a Thursday (weekday 4); January's Thursdays are 01, 08, 15, 22, 29.
function recurring(over: Partial<WeeklyRecurringSession> = {}): WeeklyRecurringSession {
  return {
    id: 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId,
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000009' as DeviceId, // template's origin ≠ generator device
    createdAt: new Date('2025-12-01T00:00:00Z'),
    updatedAt: new Date('2025-12-01T00:00:00Z'),
    updatedBy: 'usr_00000000000000000000000009' as UserId,
    deletedAt: null,
    version: 3,
    roomId: 'rom_00000000000000000000000001' as RoomId,
    teacherId: 'tch_00000000000000000000000001' as EntityId,
    dayOfWeek: 4,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    ...over,
  };
}

function holiday(over: Partial<HolidayOccurrence> = {}): HolidayOccurrence {
  return {
    id: 'hol_00000000000000000000000001' as HolidayId,
    name: { fr: 'Jour férié', ar: 'عيد' },
    kind: 'fixed',
    startDate: '2026-01-15',
    endDate: '2026-01-15',
    ...over,
  };
}

function input(over: Partial<GenerateSessionsInput> = {}): GenerateSessionsInput {
  return {
    recurring: recurring(),
    holidays: [],
    range: { start: '2026-01-01', end: '2026-01-31' },
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...over,
  };
}

function useCase(seed = 1): GenerateSessions {
  return new GenerateSessions(fakeClock(CLOCK_ISO), fakeIds(seed));
}

const datesOf = (sessions: readonly { date: string }[]): string[] => sessions.map((s) => s.date);

describe('GenerateSessions', () => {
  describe('happy path', () => {
    it('materializes one dated session per matching weekday in the range', () => {
      const sessions = useCase().execute(input());
      expect(datesOf(sessions)).toEqual([
        '2026-01-01',
        '2026-01-08',
        '2026-01-15',
        '2026-01-22',
        '2026-01-29',
      ]);
    });

    it('copies the template fields and stamps a fresh envelope on each occurrence', () => {
      const [first] = useCase().execute(input());
      expect(first).toBeDefined();
      if (!first) return;

      expect(first.id).toMatch(/^ses_/);
      expect(first.recurringSessionId).toBe('wrs_00000000000000000000000001');
      expect(first.roomId).toBe('rom_00000000000000000000000001');
      expect(first.teacherId).toBe('tch_00000000000000000000000001');
      expect(first.date).toBe('2026-01-01');
      expect(first.start).toBe('09:00');
      expect(first.end).toBe('10:30');

      // Fresh envelope — provenance is the generating device/user, not the template's.
      expect(first.centerCode).toBe(CENTER);
      expect(first.deviceOrigin).toBe(DEVICE);
      expect(first.updatedBy).toBe(USER);
      expect(first.createdAt).toEqual(new Date(CLOCK_ISO));
      expect(first.updatedAt).toEqual(first.createdAt);
      expect(first.deletedAt).toBeNull();
      expect(first.version).toBe(0);
    });

    it('only emits dates that fall on the template weekday', () => {
      const sessions = useCase().execute(input());
      for (const session of sessions) {
        expect(weekdayOf(session.date)).toBe(4);
      }
    });

    it('propagates a null teacher onto every occurrence', () => {
      const sessions = useCase().execute(input({ recurring: recurring({ teacherId: null }) }));
      expect(sessions.length).toBeGreaterThan(0);
      for (const session of sessions) {
        expect(session.teacherId).toBeNull();
      }
    });
  });

  describe('holiday skipping', () => {
    it('omits the holiday date without shifting the sessions that follow it', () => {
      const sessions = useCase().execute(input({ holidays: [holiday({ startDate: '2026-01-15', endDate: '2026-01-15' })] }));
      // 15th dropped; 22nd and 29th keep their own dates — never pulled earlier.
      expect(datesOf(sessions)).toEqual(['2026-01-01', '2026-01-08', '2026-01-22', '2026-01-29']);
    });

    it('skips every date a multi-day (lunar) holiday range covers', () => {
      const eid = holiday({ kind: 'lunar', startDate: '2026-01-07', endDate: '2026-01-09' });
      const sessions = useCase().execute(input({ holidays: [eid] }));
      expect(datesOf(sessions)).toEqual(['2026-01-01', '2026-01-15', '2026-01-22', '2026-01-29']);
    });

    it('leaves sessions untouched when a holiday falls on a non-session weekday', () => {
      // 2026-01-19 is a Monday — no Thursday occurrence to remove.
      const monday = holiday({ startDate: '2026-01-19', endDate: '2026-01-19' });
      expect(datesOf(useCase().execute(input({ holidays: [monday] })))).toEqual(
        datesOf(useCase().execute(input())),
      );
    });

    it('does not change invoice amounts — a holiday-reduced month just has fewer sessions carrying no billing data', () => {
      const withHoliday = useCase().execute(input({ holidays: [holiday()] }));
      const withoutHoliday = useCase().execute(input());

      // Billing is monthly per subscription: the generator emits pure schedule
      // rows, never a price/amount/total, so session count cannot move an invoice.
      expect(withHoliday.length).toBe(withoutHoliday.length - 1);
      for (const session of withoutHoliday) {
        expect(Object.keys(session)).not.toContain('amount');
        expect(Object.keys(session)).not.toContain('price');
        expect(Object.keys(session)).not.toContain('total');
      }
    });
  });

  describe('idempotency / determinism', () => {
    it('re-running over the same window yields an identical set (deterministic clock + ids)', () => {
      const first = useCase().execute(input());
      const second = useCase().execute(input());
      expect(second).toEqual(first);
    });

    it('keeps the (recurringSessionId, date) dedup key stable across id-generator seeds', () => {
      const key = (s: { recurringSessionId: string; date: string }) => `${s.recurringSessionId}|${s.date}`;
      const a = useCase(1).execute(input());
      const b = useCase(500).execute(input());

      expect(b.map(key)).toEqual(a.map(key)); // the upsert key is identical…
      expect(a[0]?.id).not.toBe(b[0]?.id); // …even though the fresh ULIDs differ
    });

    it('never emits the same date twice', () => {
      const dates = datesOf(useCase().execute(input({ range: { start: '2026-01-01', end: '2026-12-31' } })));
      expect(new Set(dates).size).toBe(dates.length);
    });
  });

  describe('empty results', () => {
    it('returns nothing when no date in the range falls on the template weekday', () => {
      // 2026-01-02 (Fri) → 2026-01-04 (Sun): no Thursday.
      expect(useCase().execute(input({ range: { start: '2026-01-02', end: '2026-01-04' } }))).toEqual([]);
    });

    it('returns nothing for a backwards range', () => {
      expect(useCase().execute(input({ range: { start: '2026-01-31', end: '2026-01-01' } }))).toEqual([]);
    });
  });
});
