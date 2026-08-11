import { describe, it, expect, beforeEach } from 'vitest';
import { CancelSession } from '../../../src/use-cases/cancel-session';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { SessionNotFoundError } from '../../../src/errors/scheduling-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Session, SessionId } from '../../../src/entities/session';
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
const ROOM = 'rom_00000000000000000000000001' as RoomId;
const WRS_ID = 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId;
const CLOCK_ISO = '2026-02-01T08:00:00Z';
const RANGE = { start: '2026-01-01', end: '2026-01-31' };

let seq = 0;
function session(over: Partial<Session> & Pick<Session, 'date'>): Session {
  seq += 1;
  const id = `ses_${String(seq).padStart(26, '0')}` as SessionId;
  return {
    id,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    recurringSessionId: WRS_ID,
    generationBatchId: null,
    roomId: ROOM,
    teacherId: null,
    groupId: null,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    ...over,
  };
}

describe('CancelSession', () => {
  let sessions: InMemorySessionRepository;

  function build(plan: Plan = PLANS.essentiel): CancelSession {
    return new CancelSession(sessions, fakeClock(CLOCK_ISO), new PlanPolicy(plan));
  }

  beforeEach(() => {
    seq = 0;
    sessions = new InMemorySessionRepository();
  });

  describe('happy path', () => {
    it('soft-deletes only the targeted occurrence, leaving the template\'s siblings live', async () => {
      const target = session({ date: '2026-01-08' });
      const sibling = session({ date: '2026-01-15' });
      await sessions.upsertMany([target, sibling]);

      await build().execute({ centerCode: CENTER, id: target.id, updatedBy: USER });

      // The cancelled occurrence drops out of live reads…
      expect(await sessions.findById(target.id)).toBeNull();
      const live = await sessions.listForRange(CENTER, RANGE);
      expect(live.map((s) => s.id)).toEqual([sibling.id]);
    });

    it('records who cancelled and stamps the clock as the tombstone time (soft delete, no hard delete)', async () => {
      const target = session({ date: '2026-01-08' });
      await sessions.upsertMany([target]);
      const other = 'usr_00000000000000000000000002' as UserId;

      await build().execute({ centerCode: CENTER, id: target.id, updatedBy: other });

      // The row still exists as a tombstone (sync feed sees it), not a hard delete.
      const tombstoned = (await sessions.listChangedSince(new Date('2026-01-01T00:00:00Z'))).find(
        (s) => s.id === target.id,
      );
      expect(tombstoned?.deletedAt).toEqual(new Date(CLOCK_ISO));
      expect(tombstoned?.updatedBy).toBe(other);
    });
  });

  describe('rejections', () => {
    it('throws SessionNotFoundError for an unknown occurrence id', async () => {
      await expect(
        build().execute({
          centerCode: CENTER,
          id: 'ses_00000000000000000000000099' as SessionId,
          updatedBy: USER,
        }),
      ).rejects.toBeInstanceOf(SessionNotFoundError);
    });

    it('throws SessionNotFoundError for an already-cancelled occurrence (no silent no-op)', async () => {
      const target = session({ date: '2026-01-08' });
      await sessions.upsertMany([target]);
      await build().execute({ centerCode: CENTER, id: target.id, updatedBy: USER });

      await expect(
        build().execute({ centerCode: CENTER, id: target.id, updatedBy: USER }),
      ).rejects.toBeInstanceOf(SessionNotFoundError);
    });

    it('refuses to cancel an occurrence belonging to another center', async () => {
      const target = session({ date: '2026-01-08' });
      await sessions.upsertMany([target]);

      await expect(
        build().execute({ centerCode: OTHER_CENTER, id: target.id, updatedBy: USER }),
      ).rejects.toBeInstanceOf(SessionNotFoundError);
      // The occurrence stays live under its real center — never cross-tenant deleted.
      expect(await sessions.findById(target.id)).not.toBeNull();
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.calendar.week', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      const target = session({ date: '2026-01-08' });
      await sessions.upsertMany([target]);

      await expect(
        build(planWithout).execute({ centerCode: CENTER, id: target.id, updatedBy: USER }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      // Gate is checked before any write.
      expect(await sessions.findById(target.id)).not.toBeNull();
    });
  });
});
