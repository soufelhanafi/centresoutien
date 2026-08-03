import { describe, it, expect, beforeEach } from 'vitest';
import {
  UndoGenerationBatch,
  type UndoGenerationBatchInput,
} from '../../../src/use-cases/undo-generation-batch';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { GenerationBatchNotFoundError } from '../../../src/errors/scheduling-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Session, SessionId, GenerationBatchId } from '../../../src/entities/session';
import type { WeeklyRecurringSessionId } from '../../../src/entities/weekly-recurring-session';
import type { RoomId } from '../../../src/entities/room';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import { InMemorySessionRepository } from '../fakes/in-memory-session-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const ADMIN = 'usr_00000000000000000000000002' as UserId;
const RECURRING = 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId;
const ROOM = 'rom_00000000000000000000000001' as RoomId;
const BATCH = 'gen_00000000000000000000000001' as GenerationBatchId;
const TODAY_ISO = '2026-08-15T09:00:00Z';

let seq = 0;
function seededSession(over: Partial<Session> = {}): Session {
  seq += 1;
  return {
    id: `ses_${String(seq).padStart(26, '0')}` as SessionId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock('2026-07-01T08:00:00Z')),
    recurringSessionId: RECURRING,
    generationBatchId: BATCH,
    roomId: ROOM,
    teacherId: null,
    groupId: null,
    date: '2026-08-20',
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    ...over,
  };
}

function input(over: Partial<UndoGenerationBatchInput> = {}): UndoGenerationBatchInput {
  return { centerCode: CENTER, generationBatchId: BATCH, updatedBy: ADMIN, ...over };
}

describe('UndoGenerationBatch', () => {
  let sessions: InMemorySessionRepository;
  let useCase: UndoGenerationBatch;

  beforeEach(() => {
    seq = 0;
    sessions = new InMemorySessionRepository();
    useCase = new UndoGenerationBatch(sessions, fakeClock(TODAY_ISO), new PlanPolicy(PLANS.essentiel));
  });

  describe('happy path', () => {
    it('soft-deletes every future occurrence of the batch, recording who and when', async () => {
      const a = seededSession({ date: '2026-08-20' });
      const b = seededSession({ date: '2026-08-27' });
      await sessions.save(a);
      await sessions.save(b);

      const result = await useCase.execute(input());

      expect(result).toEqual({ cancelledCount: 2, skippedOccurredCount: 0 });
      expect(await sessions.findById(a.id)).toBeNull();
      expect(await sessions.findById(b.id)).toBeNull();
      const [rowA] = sessions.all().filter((r) => r.id === a.id);
      expect(rowA?.deletedAt).toEqual(new Date(TODAY_ISO));
      expect(rowA?.updatedBy).toBe(ADMIN);
    });

    it('never hard-deletes — cancelled rows survive as tombstones for sync', async () => {
      await sessions.save(seededSession());
      await useCase.execute(input());
      expect(sessions.all()).toHaveLength(1);
    });

    it('cancels a session dated today (not yet occurred)', async () => {
      await sessions.save(seededSession({ date: '2026-08-15' }));
      const result = await useCase.execute(input());
      expect(result).toEqual({ cancelledCount: 1, skippedOccurredCount: 0 });
    });

    it('leaves already-occurred sessions untouched and reports them as skipped', async () => {
      const past = seededSession({ date: '2026-08-01' });
      const future = seededSession({ date: '2026-08-20' });
      await sessions.save(past);
      await sessions.save(future);

      const result = await useCase.execute(input());

      expect(result).toEqual({ cancelledCount: 1, skippedOccurredCount: 1 });
      expect(await sessions.findById(past.id)).not.toBeNull(); // untouched
      expect(await sessions.findById(future.id)).toBeNull(); // cancelled
    });

    it('never touches a session from a different batch', async () => {
      const otherBatch = 'gen_00000000000000000000000099' as GenerationBatchId;
      const inBatch = seededSession({ generationBatchId: BATCH });
      const outOfBatch = seededSession({ generationBatchId: otherBatch });
      await sessions.save(inBatch);
      await sessions.save(outOfBatch);

      await useCase.execute(input());

      expect(await sessions.findById(inBatch.id)).toBeNull();
      expect(await sessions.findById(outOfBatch.id)).not.toBeNull();
    });
  });

  describe('guards', () => {
    it('throws GenerationBatchNotFoundError for a batch with no live session', async () => {
      await expect(useCase.execute(input())).rejects.toBeInstanceOf(GenerationBatchNotFoundError);
    });

    it('throws GenerationBatchNotFoundError for a batch belonging to another center', async () => {
      await sessions.save(seededSession({ centerCode: OTHER_CENTER }));
      await expect(useCase.execute(input())).rejects.toBeInstanceOf(GenerationBatchNotFoundError);
    });

    it('throws GenerationBatchNotFoundError once every session in the batch is already cancelled', async () => {
      const existing = seededSession();
      await sessions.save(existing);
      await useCase.execute(input());
      await expect(useCase.execute(input())).rejects.toBeInstanceOf(GenerationBatchNotFoundError);
    });

    it('throws PlanFeatureUnavailableError when the plan lacks core.calendar.week', async () => {
      const existing = seededSession();
      await sessions.save(existing);
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new UndoGenerationBatch(sessions, fakeClock(TODAY_ISO), new PlanPolicy(planWithout));
      await expect(useCase.execute(input())).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      // Gate is checked before any write.
      expect(await sessions.findById(existing.id)).not.toBeNull();
    });
  });
});
