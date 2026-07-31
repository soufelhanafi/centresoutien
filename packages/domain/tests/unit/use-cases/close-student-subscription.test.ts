import { describe, it, expect, beforeEach } from 'vitest';
import { CloseStudentSubscription } from '../../../src/use-cases/close-student-subscription';
import { CreateStudentSubscription } from '../../../src/use-cases/create-student-subscription';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { StudentSubscriptionNotFoundError } from '../../../src/errors/subscription-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { Student, StudentId } from '../../../src/entities/student';
import type { StudentSubscriptionId } from '../../../src/entities/student-subscription';
import { InMemoryStudentSubscriptionRepository } from '../fakes/in-memory-student-subscription-repository';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const OTHER_USER = 'usr_00000000000000000000000002' as UserId;
const STUDENT_ID = 'stu_00000000000000000000000001' as StudentId;

const envelopeClock = fakeClock('2026-01-01T00:00:00Z');

function makeStudent(): Student {
  return {
    id: STUDENT_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    naturalKey: `${CENTER}::yassine-alaoui::2009-05-01`,
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    birthDate: '2009-05-01',
    level: '2 Bac SM',
    school: null,
    notes: null,
    guardianIds: [],
  };
}

describe('CloseStudentSubscription', () => {
  let subscriptions: InMemoryStudentSubscriptionRepository;
  let students: InMemoryStudentRepository;
  let create: CreateStudentSubscription;

  async function seedOpenSubscription(): Promise<StudentSubscriptionId> {
    const created = await create.execute({
      studentId: STUDENT_ID,
      formulaId: 'fml_00000000000000000000000002',
      kind: 'regular',
      subjectIds: ['sub_00000000000000000000000003'],
      startMonth: '2026-09',
      endMonth: null,
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      updatedBy: USER,
    });
    return created.id;
  }

  function close(plan: Plan, at = '2026-12-15T10:00:00Z'): CloseStudentSubscription {
    return new CloseStudentSubscription(subscriptions, fakeClock(at), new PlanPolicy(plan));
  }

  beforeEach(async () => {
    subscriptions = new InMemoryStudentSubscriptionRepository();
    students = new InMemoryStudentRepository();
    create = new CreateStudentSubscription(
      subscriptions,
      students,
      fakeClock('2026-07-31T10:00:00Z'),
      fakeIds(),
      new PlanPolicy(PLANS.essentiel),
    );
    await students.save(makeStudent());
  });

  describe('happy path', () => {
    it('caps endMonth, bumps updatedAt/updatedBy, and keeps identity fields', async () => {
      const id = await seedOpenSubscription();
      const closed = await close(PLANS.essentiel).execute({
        centerCode: CENTER,
        subscriptionId: id,
        endMonth: '2026-12',
        updatedBy: OTHER_USER,
      });

      expect(closed.endMonth).toBe('2026-12');
      expect(closed.updatedAt).toEqual(new Date('2026-12-15T10:00:00Z'));
      expect(closed.updatedBy).toBe(OTHER_USER);
      // Identity + creation preserved.
      expect(closed.id).toBe(id);
      expect(closed.startMonth).toBe('2026-09');
      expect(closed.createdAt).toEqual(new Date('2026-07-31T10:00:00Z'));
      expect(closed.deletedAt).toBeNull();
    });

    it('persists the close so the subscription reads back capped (a live tombstone-free row)', async () => {
      const id = await seedOpenSubscription();
      await close(PLANS.essentiel).execute({
        centerCode: CENTER,
        subscriptionId: id,
        endMonth: '2026-12',
        updatedBy: USER,
      });
      const found = await subscriptions.findById(id);
      expect(found?.endMonth).toBe('2026-12');
    });

    it('close then reopen the next month is allowed by the overlap invariant', async () => {
      const id = await seedOpenSubscription();
      await close(PLANS.essentiel).execute({
        centerCode: CENTER,
        subscriptionId: id,
        endMonth: '2026-12',
        updatedBy: USER,
      });
      const reopened = await create.execute({
        studentId: STUDENT_ID,
        formulaId: 'fml_00000000000000000000000099',
        kind: 'regular',
        subjectIds: ['sub_00000000000000000000000003', 'sub_00000000000000000000000004'],
        startMonth: '2027-01',
        endMonth: null,
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        updatedBy: USER,
      });
      expect(reopened.id).not.toBe(id);
      expect((await subscriptions.listLiveByStudent(STUDENT_ID)).length).toBe(2);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.formulas', async () => {
      const id = await seedOpenSubscription();
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(
        close(planWithout).execute({
          centerCode: CENTER,
          subscriptionId: id,
          endMonth: '2026-12',
          updatedBy: USER,
        }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });

  describe('resolution / tenant scoping', () => {
    it('throws StudentSubscriptionNotFoundError for an unknown id', async () => {
      await expect(
        close(PLANS.essentiel).execute({
          centerCode: CENTER,
          subscriptionId: 'sbs_00000000000000000000000099' as StudentSubscriptionId,
          endMonth: '2026-12',
          updatedBy: USER,
        }),
      ).rejects.toBeInstanceOf(StudentSubscriptionNotFoundError);
    });

    it('throws StudentSubscriptionNotFoundError for a subscription in another center', async () => {
      const id = await seedOpenSubscription();
      await expect(
        close(PLANS.essentiel).execute({
          centerCode: OTHER_CENTER,
          subscriptionId: id,
          endMonth: '2026-12',
          updatedBy: USER,
        }),
      ).rejects.toBeInstanceOf(StudentSubscriptionNotFoundError);
    });

    it('throws StudentSubscriptionNotFoundError for an already soft-deleted subscription', async () => {
      const id = await seedOpenSubscription();
      await subscriptions.softDelete(id, new Date('2026-11-01T00:00:00Z'), USER);
      await expect(
        close(PLANS.essentiel).execute({
          centerCode: CENTER,
          subscriptionId: id,
          endMonth: '2026-12',
          updatedBy: USER,
        }),
      ).rejects.toBeInstanceOf(StudentSubscriptionNotFoundError);
    });
  });

  describe('validation', () => {
    it('rejects a malformed endMonth', async () => {
      const id = await seedOpenSubscription();
      await expect(
        close(PLANS.essentiel).execute({
          centerCode: CENTER,
          subscriptionId: id,
          endMonth: '2026-13',
          updatedBy: USER,
        }),
      ).rejects.toThrow();
    });
  });
});
