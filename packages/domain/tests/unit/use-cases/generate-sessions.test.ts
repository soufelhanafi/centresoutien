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
import type { Session } from '../../../src/entities/session';
import type { RoomId } from '../../../src/entities/room';
import type { GroupId } from '../../../src/entities/group';
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
    groupId: null,
    dayOfWeek: 4,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    active: true,
    validFrom: null,
    validTo: null,
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

/** Runs the use case and returns just the materialized sessions — the shape most tests care about. */
function run(over: Partial<GenerateSessionsInput> = {}, seed = 1): readonly Session[] {
  return useCase(seed).execute(input(over)).sessions;
}

const datesOf = (sessions: readonly { date: string }[]): string[] => sessions.map((s) => s.date);

describe('GenerateSessions', () => {
  describe('happy path', () => {
    it('materializes one dated session per matching weekday in the range', () => {
      expect(datesOf(run())).toEqual([
        '2026-01-01',
        '2026-01-08',
        '2026-01-15',
        '2026-01-22',
        '2026-01-29',
      ]);
    });

    it('copies the template fields and stamps a fresh envelope on each occurrence', () => {
      const [session] = run();
      expect(session).toBeDefined();
      if (!session) return;

      expect(session.id).toMatch(/^ses_/);
      expect(session.recurringSessionId).toBe('wrs_00000000000000000000000001');
      expect(session.roomId).toBe('rom_00000000000000000000000001');
      expect(session.teacherId).toBe('tch_00000000000000000000000001');
      expect(session.groupId).toBeNull();
      expect(session.date).toBe('2026-01-01');
      expect(session.start).toBe('09:00');
      expect(session.end).toBe('10:30');

      // Fresh envelope — provenance is the generating device/user, not the template's.
      expect(session.centerCode).toBe(CENTER);
      expect(session.deviceOrigin).toBe(DEVICE);
      expect(session.updatedBy).toBe(USER);
      expect(session.createdAt).toEqual(new Date(CLOCK_ISO));
      expect(session.updatedAt).toEqual(session.createdAt);
      expect(session.deletedAt).toBeNull();
      expect(session.version).toBe(0);
      expect(session.generationBatchId).toMatch(/^gen_/);
    });

    it('stamps every occurrence of one run with the same generationBatchId (SOU-160)', () => {
      const sessions = run();
      expect(sessions.length).toBeGreaterThan(1);
      const batchIds = new Set(sessions.map((s) => s.generationBatchId));
      expect(batchIds.size).toBe(1);
    });

    it('mints a different generationBatchId for a separate run', () => {
      const first = run({}, 1);
      const second = run({}, 500);
      expect(first[0]?.generationBatchId).not.toBe(second[0]?.generationBatchId);
    });

    it('only emits dates that fall on the template weekday', () => {
      for (const session of run()) {
        expect(weekdayOf(session.date)).toBe(4);
      }
    });

    it('propagates a null teacher onto every occurrence', () => {
      const sessions = run({ recurring: recurring({ teacherId: null }) });
      expect(sessions.length).toBeGreaterThan(0);
      for (const session of sessions) {
        expect(session.teacherId).toBeNull();
      }
    });

    it('inherits the template groupId onto every occurrence (SOU-130)', () => {
      const groupId = 'grp_00000000000000000000000001' as GroupId;
      const sessions = run({ recurring: recurring({ groupId }) });
      expect(sessions.length).toBeGreaterThan(0);
      for (const session of sessions) {
        expect(session.groupId).toBe(groupId);
      }
    });

    it('never invents a group the template lacks — a null template groupId stays null', () => {
      const sessions = run({ recurring: recurring({ groupId: null }) });
      expect(sessions.length).toBeGreaterThan(0);
      for (const session of sessions) {
        expect(session.groupId).toBeNull();
      }
    });
  });

  describe('holiday skipping', () => {
    it('omits the holiday date without shifting the sessions that follow it', () => {
      const sessions = run({ holidays: [holiday({ startDate: '2026-01-15', endDate: '2026-01-15' })] });
      // 15th dropped; 22nd and 29th keep their own dates — never pulled earlier.
      expect(datesOf(sessions)).toEqual(['2026-01-01', '2026-01-08', '2026-01-22', '2026-01-29']);
    });

    it('skips every date a multi-day (lunar) holiday range covers', () => {
      const eid = holiday({ kind: 'lunar', startDate: '2026-01-07', endDate: '2026-01-09' });
      expect(datesOf(run({ holidays: [eid] }))).toEqual(['2026-01-01', '2026-01-15', '2026-01-22', '2026-01-29']);
    });

    it('leaves sessions untouched when a holiday falls on a non-session weekday', () => {
      // 2026-01-19 is a Monday — no Thursday occurrence to remove.
      const monday = holiday({ startDate: '2026-01-19', endDate: '2026-01-19' });
      expect(datesOf(run({ holidays: [monday] }))).toEqual(datesOf(run()));
    });

    it('does not change invoice amounts — a holiday-reduced month just has fewer sessions carrying no billing data', () => {
      const withHoliday = run({ holidays: [holiday()] });
      const withoutHoliday = run();

      // Billing is monthly per subscription: the generator emits pure schedule
      // rows, never a price/amount/total, so session count cannot move an invoice.
      expect(withHoliday.length).toBe(withoutHoliday.length - 1);
      for (const session of withoutHoliday) {
        expect(Object.keys(session)).not.toContain('amount');
        expect(Object.keys(session)).not.toContain('price');
        expect(Object.keys(session)).not.toContain('total');
      }
    });

    it('reports the skipped date and matched holiday in skippedHolidays (SOU-161)', () => {
      const eid = holiday({ id: 'hol_00000000000000000000000002' as HolidayId, startDate: '2026-01-15', endDate: '2026-01-15' });
      const { skippedHolidays } = useCase().execute(input({ holidays: [eid] }));
      expect(skippedHolidays).toEqual([{ date: '2026-01-15', holiday: eid }]);
    });

    it('reports one entry per skipped date across a multi-day holiday range', () => {
      const eid = holiday({ kind: 'lunar', startDate: '2026-01-01', endDate: '2026-01-09' });
      const { skippedHolidays } = useCase().execute(input({ holidays: [eid] }));
      expect(skippedHolidays.map((s) => s.date)).toEqual(['2026-01-01', '2026-01-08']);
      expect(skippedHolidays.every((s) => s.holiday === eid)).toBe(true);
    });

    it('returns an empty skippedHolidays list when no configured holiday is hit', () => {
      const { skippedHolidays } = useCase().execute(input());
      expect(skippedHolidays).toEqual([]);
    });
  });

  describe('holiday override (SOU-161)', () => {
    it('materializes a session on a date explicitly overridden despite the holiday', () => {
      const eid = holiday({ startDate: '2026-01-15', endDate: '2026-01-15' });
      const { sessions, skippedHolidays } = useCase().execute(
        input({ holidays: [eid], overrideHolidayDates: ['2026-01-15'] }),
      );
      expect(datesOf(sessions)).toContain('2026-01-15');
      expect(skippedHolidays).toEqual([]);
    });

    it('still skips every other holiday date not named in the override list', () => {
      const first = holiday({ id: 'hol_00000000000000000000000001' as HolidayId, startDate: '2026-01-08', endDate: '2026-01-08' });
      const second = holiday({ id: 'hol_00000000000000000000000002' as HolidayId, startDate: '2026-01-15', endDate: '2026-01-15' });
      const { sessions, skippedHolidays } = useCase().execute(
        input({ holidays: [first, second], overrideHolidayDates: ['2026-01-08'] }),
      );
      expect(datesOf(sessions)).toEqual(['2026-01-01', '2026-01-08', '2026-01-22', '2026-01-29']);
      expect(skippedHolidays).toEqual([{ date: '2026-01-15', holiday: second }]);
    });

    it('ignores an override date that never had a session to begin with', () => {
      const eid = holiday({ startDate: '2026-01-15', endDate: '2026-01-15' });
      const { sessions } = useCase().execute(
        input({ holidays: [eid], overrideHolidayDates: ['2026-01-19'] }), // a Monday, no session
      );
      expect(datesOf(sessions)).toEqual(['2026-01-01', '2026-01-08', '2026-01-22', '2026-01-29']);
    });

    it('defaults to no override when the field is omitted — unchanged from prior behavior', () => {
      const eid = holiday({ startDate: '2026-01-15', endDate: '2026-01-15' });
      expect(datesOf(run({ holidays: [eid] }))).toEqual(['2026-01-01', '2026-01-08', '2026-01-22', '2026-01-29']);
    });
  });

  describe('idempotency / determinism', () => {
    it('re-running over the same window yields an identical set (deterministic clock + ids)', () => {
      const first = run();
      const second = run();
      expect(second).toEqual(first);
    });

    it('keeps the (recurringSessionId, date) dedup key stable across id-generator seeds', () => {
      const key = (s: { recurringSessionId: string; date: string }) => `${s.recurringSessionId}|${s.date}`;
      const a = run({}, 1);
      const b = run({}, 500);

      expect(b.map(key)).toEqual(a.map(key)); // the upsert key is identical…
      expect(a[0]?.id).not.toBe(b[0]?.id); // …even though the fresh ULIDs differ
    });

    it('never emits the same date twice', () => {
      const dates = datesOf(run({ range: { start: '2026-01-01', end: '2026-12-31' } }));
      expect(new Set(dates).size).toBe(dates.length);
    });
  });

  describe('active toggle and validity window (SOU-52)', () => {
    it('materializes nothing when the template is paused (active === false)', () => {
      expect(run({ recurring: recurring({ active: false }) })).toEqual([]);
    });

    it('skips occurrences before validFrom', () => {
      // validFrom mid-month: the 01 and 08 Thursdays are dropped, 15/22/29 kept.
      expect(datesOf(run({ recurring: recurring({ validFrom: '2026-01-15' }) }))).toEqual([
        '2026-01-15',
        '2026-01-22',
        '2026-01-29',
      ]);
    });

    it('skips occurrences after validTo', () => {
      expect(datesOf(run({ recurring: recurring({ validTo: '2026-01-15' }) }))).toEqual([
        '2026-01-01',
        '2026-01-08',
        '2026-01-15',
      ]);
    });

    it('keeps only occurrences inside a bounded [validFrom, validTo] window', () => {
      expect(
        datesOf(run({ recurring: recurring({ validFrom: '2026-01-08', validTo: '2026-01-22' }) })),
      ).toEqual(['2026-01-08', '2026-01-15', '2026-01-22']);
    });

    it('includes boundary dates (window is inclusive on both ends)', () => {
      expect(
        datesOf(run({ recurring: recurring({ validFrom: '2026-01-15', validTo: '2026-01-15' }) })),
      ).toEqual(['2026-01-15']);
    });

    it('leaves an unbounded (null/null) window unaffected', () => {
      const bounded = run({ recurring: recurring({ validFrom: null, validTo: null }) });
      expect(datesOf(bounded)).toEqual(datesOf(run()));
    });
  });

  describe('empty results', () => {
    it('returns nothing when no date in the range falls on the template weekday', () => {
      // 2026-01-02 (Fri) → 2026-01-04 (Sun): no Thursday.
      expect(run({ range: { start: '2026-01-02', end: '2026-01-04' } })).toEqual([]);
    });

    it('returns nothing for a backwards range', () => {
      expect(run({ range: { start: '2026-01-31', end: '2026-01-01' } })).toEqual([]);
    });
  });
});
