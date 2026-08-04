import { describe, it, expect, beforeEach } from 'vitest';
import {
  GenerateAndPersistSessions,
  type GenerateAndPersistSessionsInput,
} from '../../../src/use-cases/generate-and-persist-sessions';
import { GenerateSessions } from '../../../src/use-cases/generate-sessions';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { WeeklyRecurringSessionNotFoundError } from '../../../src/errors/scheduling-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from '../../../src/entities/weekly-recurring-session';
import type { Holiday, HolidayId } from '../../../src/entities/holiday';
import type { RoomId } from '../../../src/entities/room';
import type { GroupId } from '../../../src/entities/group';
import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import { InMemorySessionRepository } from '../fakes/in-memory-session-repository';
import { InMemoryWeeklyRecurringSessionRepository } from '../fakes/in-memory-weekly-recurring-session-repository';
import { InMemoryHolidayRepository } from '../fakes/in-memory-holiday-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const ROOM = 'rom_00000000000000000000000001' as RoomId;
const TEACHER = 'tch_00000000000000000000000001' as EntityId;
const WRS_ID = 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId;
const CLOCK_ISO = '2026-01-01T08:00:00Z';

// 2026-01-01 is a Thursday (weekday 4); January's Thursdays are 01, 08, 15, 22, 29.
function recurring(over: Partial<WeeklyRecurringSession> = {}): WeeklyRecurringSession {
  return {
    id: WRS_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    roomId: ROOM,
    teacherId: TEACHER,
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

function holiday(over: Partial<Holiday> = {}): Holiday {
  return {
    id: 'hol_00000000000000000000000001' as HolidayId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    name: { fr: 'Jour férié', ar: 'عيد' },
    kind: 'fixed',
    startDate: '2026-01-15',
    endDate: '2026-01-15',
    affectsInvoicing: false,
    ...over,
  };
}

function input(over: Partial<GenerateAndPersistSessionsInput> = {}): GenerateAndPersistSessionsInput {
  return {
    centerCode: CENTER,
    recurringSessionId: WRS_ID,
    range: { start: '2026-01-01', end: '2026-01-31' },
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...over,
  };
}

const datesOf = (sessions: readonly { date: string }[]): string[] => sessions.map((s) => s.date);

describe('GenerateAndPersistSessions', () => {
  let sessions: InMemorySessionRepository;
  let recurrences: InMemoryWeeklyRecurringSessionRepository;
  let holidays: InMemoryHolidayRepository;
  let useCase: GenerateAndPersistSessions;

  function build(plan: Plan = PLANS.essentiel, seed = 1): GenerateAndPersistSessions {
    return new GenerateAndPersistSessions(
      sessions,
      recurrences,
      holidays,
      new GenerateSessions(fakeClock(CLOCK_ISO), fakeIds(seed)),
      new PlanPolicy(plan),
    );
  }

  beforeEach(async () => {
    sessions = new InMemorySessionRepository();
    recurrences = new InMemoryWeeklyRecurringSessionRepository();
    holidays = new InMemoryHolidayRepository();
    await recurrences.save(recurring());
    useCase = build();
  });

  describe('happy path', () => {
    it('generates and persists one dated occurrence per matching weekday', async () => {
      const result = await useCase.execute(input());
      expect(datesOf(result.sessions)).toEqual([
        '2026-01-01',
        '2026-01-08',
        '2026-01-15',
        '2026-01-22',
        '2026-01-29',
      ]);
      // sessions is the persisted truth, not the generator output: it deep-equals
      // a fresh range read (same ids, same envelopes), not merely the same dates.
      const stored = await sessions.listForRange(CENTER, { start: '2026-01-01', end: '2026-01-31' });
      expect(result.sessions).toEqual(stored);
    });

    it('returns this run\'s own generationBatchId (SOU-160)', async () => {
      const result = await useCase.execute(input());
      expect(result.generationBatchId).toMatch(/^gen_/);
      expect(result.sessions.every((s) => s.generationBatchId === result.generationBatchId)).toBe(
        true,
      );
    });

    it('returns a null generationBatchId when the run materializes nothing', async () => {
      await recurrences.save(recurring({ active: false }));
      const result = await useCase.execute(input());
      expect(result.sessions).toEqual([]);
      expect(result.generationBatchId).toBeNull();
    });

    it('skips holiday dates (delegated to the pure generator)', async () => {
      await holidays.save(holiday({ startDate: '2026-01-15', endDate: '2026-01-15' }));
      const result = await useCase.execute(input());
      expect(datesOf(result.sessions)).toEqual(['2026-01-01', '2026-01-08', '2026-01-22', '2026-01-29']);
    });

    it('persists occurrences inheriting the template\'s groupId (SOU-130)', async () => {
      const groupId = 'grp_00000000000000000000000001' as GroupId;
      await recurrences.save(recurring({ groupId }));
      const result = await useCase.execute(input());
      expect(result.sessions.length).toBeGreaterThan(0);
      for (const session of result.sessions) {
        expect(session.groupId).toBe(groupId);
      }
    });

    it('scopes holidays to the request center — another center\'s holiday does not skip', async () => {
      await holidays.save(
        holiday({
          id: 'hol_00000000000000000000000002' as HolidayId,
          centerCode: OTHER_CENTER,
          startDate: '2026-01-15',
          endDate: '2026-01-15',
        }),
      );
      expect(datesOf((await useCase.execute(input())).sessions)).toContain('2026-01-15');
    });

    it('reports skipped holiday dates alongside the persisted sessions (SOU-161)', async () => {
      await holidays.save(holiday({ startDate: '2026-01-15', endDate: '2026-01-15' }));
      const result = await useCase.execute(input());
      expect(result.skippedHolidays).toEqual([{ date: '2026-01-15', holiday: expect.objectContaining({ id: 'hol_00000000000000000000000001' }) }]);
    });

    it('persists a session on a date explicitly overridden despite the holiday', async () => {
      await holidays.save(holiday({ startDate: '2026-01-15', endDate: '2026-01-15' }));
      const result = await useCase.execute(input({ overrideHolidayDates: ['2026-01-15'] }));
      expect(datesOf(result.sessions)).toContain('2026-01-15');
      expect(result.skippedHolidays).toEqual([]);
    });
  });

  describe('idempotent re-run', () => {
    it('re-running over the same window persists no duplicates and no changes to existing rows', async () => {
      await useCase.execute(input());
      const afterFirst = await sessions.listForRange(CENTER, { start: '2026-01-01', end: '2026-01-31' });

      // Second run mints fresh ULIDs (different seed) — the natural-key upsert must discard them.
      await build(PLANS.essentiel, 500).execute(input());
      const afterSecond = await sessions.listForRange(CENTER, { start: '2026-01-01', end: '2026-01-31' });

      expect(afterSecond).toEqual(afterFirst); // same ids, same envelopes — untouched
    });

    it('a widened window inserts only the newly-covered dates', async () => {
      await useCase.execute(input({ range: { start: '2026-01-01', end: '2026-01-15' } }));
      expect((await sessions.listForRange(CENTER, { start: '2026-01-01', end: '2026-01-31' })).length).toBe(3);

      await build(PLANS.essentiel, 500).execute(input()); // full month
      const dates = datesOf(await sessions.listForRange(CENTER, { start: '2026-01-01', end: '2026-01-31' }));
      expect(dates).toEqual(['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22', '2026-01-29']);
    });

    it('returns the persisted window on re-run: original ids, no cancelled occurrence', async () => {
      const first = await useCase.execute(input());
      // Cancel the first occurrence (2026-01-01) so the re-run must not report it,
      // even though the pure generator would still emit that date.
      const cancelled = first.sessions.find((s) => s.date === '2026-01-01');
      expect(cancelled).toBeDefined();
      if (!cancelled) return;
      await sessions.softDelete(cancelled.id, new Date('2026-01-02T00:00:00Z'), USER);

      // Second run mints fresh ULIDs for every date (different seed).
      const second = await build(PLANS.essentiel, 500).execute(input());

      // (a) A pre-existing live date carries its ORIGINAL stored id, not a fresh ULID.
      const original = first.sessions.find((s) => s.date === '2026-01-08');
      const returned = second.sessions.find((s) => s.date === '2026-01-08');
      expect(original).toBeDefined();
      expect(returned?.id).toBe(original?.id);

      // (b) The cancelled date is absent from the returned window (persisted truth).
      expect(datesOf(second.sessions)).not.toContain('2026-01-01');
      expect(datesOf(second.sessions)).toEqual(['2026-01-08', '2026-01-15', '2026-01-22', '2026-01-29']);
    });

    it('a widened window only tags the newly-covered dates with the new run\'s generationBatchId (SOU-160)', async () => {
      const first = await useCase.execute(input({ range: { start: '2026-01-01', end: '2026-01-15' } }));
      const originalBatchId = first.generationBatchId;
      expect(originalBatchId).toMatch(/^gen_/);

      const second = await build(PLANS.essentiel, 500).execute(input()); // full month
      const byDate = new Map(second.sessions.map((s) => [s.date, s]));

      // Pre-existing dates keep their original batch id, untouched by the re-run.
      expect(byDate.get('2026-01-01')?.generationBatchId).toBe(originalBatchId);
      expect(byDate.get('2026-01-08')?.generationBatchId).toBe(originalBatchId);
      expect(byDate.get('2026-01-15')?.generationBatchId).toBe(originalBatchId);

      // Newly-covered dates carry the second run's own (different) batch id —
      // which is exactly the id `second.generationBatchId` itself reports.
      expect(second.generationBatchId).not.toBe(originalBatchId);
      const newBatchId = byDate.get('2026-01-22')?.generationBatchId;
      expect(newBatchId).toBe(second.generationBatchId);
      expect(byDate.get('2026-01-29')?.generationBatchId).toBe(newBatchId);
    });

    it('never resurrects a cancelled (soft-deleted) occurrence', async () => {
      const first = await useCase.execute(input());
      const [firstSession] = first.sessions;
      expect(firstSession).toBeDefined();
      if (!firstSession) return;
      await sessions.softDelete(firstSession.id, new Date('2026-01-02T00:00:00Z'), USER);

      await build(PLANS.essentiel, 500).execute(input());
      // The cancelled date stays gone from live reads.
      expect(datesOf(await sessions.listForRange(CENTER, { start: '2026-01-01', end: '2026-01-31' }))).not.toContain(
        '2026-01-01',
      );
    });
  });

  describe('template resolution', () => {
    it('throws WeeklyRecurringSessionNotFoundError for an unknown recurrence id', async () => {
      await expect(
        useCase.execute(input({ recurringSessionId: 'wrs_00000000000000000000000099' as WeeklyRecurringSessionId })),
      ).rejects.toBeInstanceOf(WeeklyRecurringSessionNotFoundError);
    });

    it('throws WeeklyRecurringSessionNotFoundError for a tombstoned template', async () => {
      await recurrences.softDelete(WRS_ID, new Date('2026-01-02T00:00:00Z'), USER);
      await expect(useCase.execute(input())).rejects.toBeInstanceOf(
        WeeklyRecurringSessionNotFoundError,
      );
    });

    it('rejects a template belonging to another center (never generates cross-tenant)', async () => {
      await expect(useCase.execute(input({ centerCode: OTHER_CENTER }))).rejects.toBeInstanceOf(
        WeeklyRecurringSessionNotFoundError,
      );
      // Nothing was persisted under the foreign center.
      expect(await sessions.listForRange(OTHER_CENTER, { start: '2026-01-01', end: '2026-01-31' })).toEqual([]);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.calendar.week', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(build(planWithout).execute(input())).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
      // Gate is checked before any write.
      expect(await sessions.listForRange(CENTER, { start: '2026-01-01', end: '2026-01-31' })).toEqual([]);
    });
  });
});
