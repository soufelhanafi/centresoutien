import { describe, it, expect, beforeEach } from 'vitest';
import { ResetPlanning, type ResetPlanningInput } from '../../../src/use-cases/reset-planning';
import type {
  ResetPlanningUnit,
  ResetPlanningUnitOfWork,
} from '../../../src/ports/reset-planning-unit-of-work';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Session, SessionId } from '../../../src/entities/session';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from '../../../src/entities/weekly-recurring-session';
import type { RoomId } from '../../../src/entities/room';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import { InMemorySessionRepository } from '../fakes/in-memory-session-repository';
import { InMemoryWeeklyRecurringSessionRepository } from '../fakes/in-memory-weekly-recurring-session-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const ADMIN = 'usr_00000000000000000000000002' as UserId;
const RECURRING = 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId;
const ROOM = 'rom_00000000000000000000000001' as RoomId;
const TODAY_ISO = '2026-08-15T09:00:00Z';
const CUTOFF = '2026-08-15';

/**
 * Fake commit seam that actually applies the soft-deletes to the two in-memory
 * repositories, so a test can assert the rows became tombstones. Records the last
 * committed unit so a test can assert both sets arrived in ONE call.
 */
class ApplyingResetPlanningUnitOfWork implements ResetPlanningUnitOfWork {
  commits: ResetPlanningUnit[] = [];
  constructor(
    private readonly sessions: InMemorySessionRepository,
    private readonly templates: InMemoryWeeklyRecurringSessionRepository,
  ) {}
  async commit(unit: ResetPlanningUnit): Promise<void> {
    this.commits.push(unit);
    for (const session of unit.sessions) {
      await this.sessions.softDelete(session.id, unit.deletedAt, unit.updatedBy);
    }
    for (const template of unit.templates) {
      await this.templates.softDelete(template.id, unit.deletedAt, unit.updatedBy);
    }
  }
}

/** Fake that fails partway so the use case's all-or-nothing delegation is provable. */
class ThrowingResetPlanningUnitOfWork implements ResetPlanningUnitOfWork {
  async commit(): Promise<void> {
    throw new Error('commit failed');
  }
}

let sessionSeq = 0;
function seededSession(over: Partial<Session> = {}): Session {
  sessionSeq += 1;
  return {
    id: `ses_${String(sessionSeq).padStart(26, '0')}` as SessionId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock('2026-07-01T08:00:00Z')),
    recurringSessionId: RECURRING,
    generationBatchId: null,
    roomId: ROOM,
    teacherId: null,
    groupId: null,
    date: '2026-08-20',
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    ...over,
  };
}

let templateSeq = 0;
function seededTemplate(over: Partial<WeeklyRecurringSession> = {}): WeeklyRecurringSession {
  templateSeq += 1;
  return {
    id: `wrs_${String(templateSeq).padStart(26, '0')}` as WeeklyRecurringSessionId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock('2026-07-01T08:00:00Z')),
    roomId: ROOM,
    teacherId: null,
    groupId: null,
    dayOfWeek: 3 as WeekdayIndex,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    active: true,
    validFrom: null,
    validTo: null,
    conflictAccepted: false,
    ...over,
  };
}

function input(over: Partial<ResetPlanningInput> = {}): ResetPlanningInput {
  return { centerCode: CENTER, cutoffDate: CUTOFF, updatedBy: ADMIN, ...over };
}

describe('ResetPlanning', () => {
  let sessions: InMemorySessionRepository;
  let templates: InMemoryWeeklyRecurringSessionRepository;
  let unitOfWork: ApplyingResetPlanningUnitOfWork;
  let useCase: ResetPlanning;

  beforeEach(() => {
    sessionSeq = 0;
    templateSeq = 0;
    sessions = new InMemorySessionRepository();
    templates = new InMemoryWeeklyRecurringSessionRepository();
    unitOfWork = new ApplyingResetPlanningUnitOfWork(sessions, templates);
    useCase = new ResetPlanning(sessions, templates, fakeClock(TODAY_ISO), new PlanPolicy(PLANS.essentiel), unitOfWork);
  });

  describe('happy path', () => {
    it('soft-deletes every future session and every template, returning the counts', async () => {
      const futureA = seededSession({ date: '2026-08-20' });
      const futureB = seededSession({ date: '2026-09-01' });
      await sessions.save(futureA);
      await sessions.save(futureB);
      const templateA = seededTemplate({ dayOfWeek: 1 as WeekdayIndex });
      const templateB = seededTemplate({ dayOfWeek: 4 as WeekdayIndex });
      await templates.save(templateA);
      await templates.save(templateB);

      const result = await useCase.execute(input());

      expect(result).toEqual({ sessionsDeleted: 2, templatesDeleted: 2 });
      expect(await sessions.findById(futureA.id)).toBeNull();
      expect(await sessions.findById(futureB.id)).toBeNull();
      expect(await templates.findById(templateA.id)).toBeNull();
      expect(await templates.findById(templateB.id)).toBeNull();
    });

    it('stamps deletedAt from the Clock and updatedBy on every cleared row', async () => {
      const future = seededSession({ date: '2026-08-20' });
      await sessions.save(future);
      await templates.save(seededTemplate());

      await useCase.execute(input());

      const [tombstonedSession] = sessions.all().filter((row) => row.id === future.id);
      expect(tombstonedSession?.deletedAt).toEqual(new Date(TODAY_ISO));
      expect(tombstonedSession?.updatedBy).toBe(ADMIN);
    });

    it('never hard-deletes — cleared rows survive as tombstones for sync', async () => {
      await sessions.save(seededSession({ date: '2026-08-20' }));
      await templates.save(seededTemplate());

      await useCase.execute(input());

      expect(sessions.all()).toHaveLength(1);
      expect(templates.all()).toHaveLength(1);
    });

    it('commits both sets through a single unit-of-work call', async () => {
      await sessions.save(seededSession({ date: '2026-08-20' }));
      await templates.save(seededTemplate());

      await useCase.execute(input());

      expect(unitOfWork.commits).toHaveLength(1);
      expect(unitOfWork.commits[0]?.sessions).toHaveLength(1);
      expect(unitOfWork.commits[0]?.templates).toHaveLength(1);
    });

    it('returns zero counts for a center with no live planning', async () => {
      const result = await useCase.execute(input());
      expect(result).toEqual({ sessionsDeleted: 0, templatesDeleted: 0 });
    });

    it('never touches another center\'s planning', async () => {
      const mine = seededSession({ date: '2026-08-20' });
      const theirs = seededSession({ date: '2026-08-20', centerCode: OTHER_CENTER });
      await sessions.save(mine);
      await sessions.save(theirs);
      const myTemplate = seededTemplate();
      const theirTemplate = seededTemplate({ centerCode: OTHER_CENTER });
      await templates.save(myTemplate);
      await templates.save(theirTemplate);

      const result = await useCase.execute(input());

      expect(result).toEqual({ sessionsDeleted: 1, templatesDeleted: 1 });
      expect(await sessions.findById(theirs.id)).not.toBeNull();
      expect(await templates.findById(theirTemplate.id)).not.toBeNull();
    });
  });

  describe('past sessions survive (payroll inputs)', () => {
    it('leaves sessions dated before the cutoff untouched', async () => {
      const past = seededSession({ date: '2026-08-01' });
      const future = seededSession({ date: '2026-08-20' });
      await sessions.save(past);
      await sessions.save(future);

      const result = await useCase.execute(input());

      expect(result.sessionsDeleted).toBe(1);
      expect(await sessions.findById(past.id)).not.toBeNull();
      expect(await sessions.findById(future.id)).toBeNull();
    });

    it('clears a session dated exactly on the cutoff (inclusive lower bound)', async () => {
      const onCutoff = seededSession({ date: CUTOFF });
      await sessions.save(onCutoff);

      const result = await useCase.execute(input());

      expect(result.sessionsDeleted).toBe(1);
      expect(await sessions.findById(onCutoff.id)).toBeNull();
    });
  });

  describe('idempotency / already-tombstoned', () => {
    it('a second reset finds nothing live and clears nothing', async () => {
      await sessions.save(seededSession({ date: '2026-08-20' }));
      await templates.save(seededTemplate());
      await useCase.execute(input());

      const second = await useCase.execute(input());

      expect(second).toEqual({ sessionsDeleted: 0, templatesDeleted: 0 });
    });

    it('counts only the live rows when a future session is already cancelled', async () => {
      const alreadyGone = seededSession({ date: '2026-08-20' });
      const live = seededSession({ date: '2026-08-27' });
      await sessions.save(alreadyGone);
      await sessions.save(live);
      await sessions.softDelete(alreadyGone.id, new Date('2026-08-10T00:00:00Z'), USER);

      const result = await useCase.execute(input());

      expect(result.sessionsDeleted).toBe(1);
    });
  });

  describe('atomicity', () => {
    it('propagates a commit failure and leaves every row untouched (no partial wipe)', async () => {
      const future = seededSession({ date: '2026-08-20' });
      await sessions.save(future);
      const template = seededTemplate();
      await templates.save(template);
      useCase = new ResetPlanning(
        sessions,
        templates,
        fakeClock(TODAY_ISO),
        new PlanPolicy(PLANS.essentiel),
        new ThrowingResetPlanningUnitOfWork(),
      );

      await expect(useCase.execute(input())).rejects.toThrow('commit failed');
      expect(await sessions.findById(future.id)).not.toBeNull();
      expect(await templates.findById(template.id)).not.toBeNull();
    });
  });

  describe('guards', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.calendar.week', async () => {
      const future = seededSession({ date: '2026-08-20' });
      await sessions.save(future);
      const template = seededTemplate();
      await templates.save(template);
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new ResetPlanning(sessions, templates, fakeClock(TODAY_ISO), new PlanPolicy(planWithout), unitOfWork);

      await expect(useCase.execute(input())).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      // Gate is checked before any read or write.
      expect(await sessions.findById(future.id)).not.toBeNull();
      expect(await templates.findById(template.id)).not.toBeNull();
      expect(unitOfWork.commits).toHaveLength(0);
    });
  });
});
