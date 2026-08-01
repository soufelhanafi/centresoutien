import { describe, it, expect, beforeEach } from 'vitest';
import {
  CancelWeeklyRecurringSession,
  type CancelWeeklyRecurringSessionInput,
} from '../../../src/use-cases/cancel-weekly-recurring-session';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { WeeklyRecurringSessionNotFoundError } from '../../../src/errors/scheduling-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from '../../../src/entities/weekly-recurring-session';
import type { RoomId } from '../../../src/entities/room';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import { InMemoryWeeklyRecurringSessionRepository } from '../fakes/in-memory-weekly-recurring-session-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const REMOVER = 'usr_00000000000000000000000002' as UserId;

let seq = 0;
function seededSession(over: Partial<WeeklyRecurringSession> = {}): WeeklyRecurringSession {
  seq += 1;
  return {
    id: `wrs_${String(seq).padStart(26, '0')}` as WeeklyRecurringSessionId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock('2026-07-01T08:00:00Z')),
    roomId: 'rom_00000000000000000000000001' as RoomId,
    teacherId: null,
    groupId: null,
    dayOfWeek: 1,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    active: true,
    validFrom: null,
    validTo: null,
    ...over,
  };
}

function input(
  id: WeeklyRecurringSessionId,
  over: Partial<CancelWeeklyRecurringSessionInput> = {},
): CancelWeeklyRecurringSessionInput {
  return { id, centerCode: CENTER, updatedBy: REMOVER, ...over };
}

describe('CancelWeeklyRecurringSession', () => {
  let sessions: InMemoryWeeklyRecurringSessionRepository;
  let useCase: CancelWeeklyRecurringSession;

  beforeEach(() => {
    sessions = new InMemoryWeeklyRecurringSessionRepository();
    useCase = new CancelWeeklyRecurringSession(
      sessions,
      fakeClock('2026-08-01T12:00:00Z'),
      new PlanPolicy(PLANS.essentiel),
    );
  });

  describe('happy path', () => {
    it('soft-deletes the slot (tombstoned, hidden from live reads) recording who and when', async () => {
      const existing = seededSession();
      await sessions.save(existing);

      await useCase.execute(input(existing.id));

      // Hidden from the tombstone-excluding read.
      expect(await sessions.findById(existing.id)).toBeNull();
      // Still present as a tombstone carrying the actor + UTC clock time.
      const [row] = sessions.all();
      expect(row?.deletedAt).toEqual(new Date('2026-08-01T12:00:00Z'));
      expect(row?.updatedAt).toEqual(new Date('2026-08-01T12:00:00Z'));
      expect(row?.updatedBy).toBe(REMOVER);
    });

    it('never hard-deletes — the row survives as a tombstone for sync', async () => {
      const existing = seededSession();
      await sessions.save(existing);
      await useCase.execute(input(existing.id));
      expect(sessions.all()).toHaveLength(1);
    });
  });

  describe('guards', () => {
    it('throws WeeklyRecurringSessionNotFoundError for an unknown id', async () => {
      await expect(
        useCase.execute(input('wrs_00000000000000000000009999' as WeeklyRecurringSessionId)),
      ).rejects.toBeInstanceOf(WeeklyRecurringSessionNotFoundError);
    });

    it('throws WeeklyRecurringSessionNotFoundError for an already-cancelled slot', async () => {
      const existing = seededSession();
      await sessions.save(existing);
      await useCase.execute(input(existing.id));
      await expect(useCase.execute(input(existing.id))).rejects.toBeInstanceOf(
        WeeklyRecurringSessionNotFoundError,
      );
    });

    it('throws WeeklyRecurringSessionNotFoundError for a foreign-center row', async () => {
      const foreign = seededSession({ centerCode: OTHER_CENTER });
      await sessions.save(foreign);
      await expect(useCase.execute(input(foreign.id))).rejects.toBeInstanceOf(
        WeeklyRecurringSessionNotFoundError,
      );
    });

    it('throws PlanFeatureUnavailableError when the plan lacks core.calendar.week', async () => {
      const existing = seededSession();
      await sessions.save(existing);
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new CancelWeeklyRecurringSession(sessions, fakeClock(), new PlanPolicy(planWithout));
      await expect(useCase.execute(input(existing.id))).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
      // Not tombstoned — the gate rejected before the write.
      expect(await sessions.findById(existing.id)).not.toBeNull();
    });
  });
});
