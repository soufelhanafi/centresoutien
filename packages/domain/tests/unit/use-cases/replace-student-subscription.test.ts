import { describe, it, expect, beforeEach } from 'vitest';
import { ReplaceStudentSubscription } from '../../../src/use-cases/replace-student-subscription';
import { CreateStudentSubscription } from '../../../src/use-cases/create-student-subscription';
import { CloseStudentSubscription } from '../../../src/use-cases/close-student-subscription';
import { CreateInvoiceDraft } from '../../../src/use-cases/create-invoice-draft';
import { GenerateStudentMonthInvoice } from '../../../src/use-cases/generate-student-month-invoice';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import {
  InvalidSubscriptionReplacementMonthError,
  StudentSubscriptionNotFoundError,
  TooManyActiveSubscriptionsError,
} from '../../../src/errors/subscription-errors';
import { StudentNotFoundError } from '../../../src/errors/student-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { Student, StudentId } from '../../../src/entities/student';
import type {
  StudentSubscription,
  StudentSubscriptionId,
} from '../../../src/entities/student-subscription';
import { InMemoryStudentSubscriptionRepository } from '../fakes/in-memory-student-subscription-repository';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import { InMemoryFormulaRepository } from '../fakes/in-memory-formula-repository';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import { planWithoutFeature } from '../fakes/plans';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const STUDENT_ID = 'stu_00000000000000000000000001' as StudentId;

const SUBJECT = 'sub_00000000000000000000000003';

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

/** A repo whose `save` throws for one specific id — to simulate a create failure after the close. */
class FailingCreateSubscriptionRepository extends InMemoryStudentSubscriptionRepository {
  constructor(private readonly failingId: StudentSubscriptionId) {
    super();
  }
  override async save(subscription: StudentSubscription): Promise<void> {
    if (subscription.id === this.failingId) throw new Error('simulated create failure after close');
    return super.save(subscription);
  }
}

describe('ReplaceStudentSubscription', () => {
  let subscriptions: InMemoryStudentSubscriptionRepository;
  let students: InMemoryStudentRepository;
  let create: CreateStudentSubscription;
  let close: CloseStudentSubscription;

  function replace(plan = PLANS.essentiel): ReplaceStudentSubscription {
    return new ReplaceStudentSubscription(
      subscriptions,
      students,
      fakeClock('2027-01-15T10:00:00Z'),
      fakeIds(100),
      new PlanPolicy(plan),
    );
  }

  async function seedOpen(): Promise<StudentSubscriptionId> {
    const { subscription } = await create.execute({
      studentId: STUDENT_ID,
      formulaId: 'fml_00000000000000000000000002',
      kind: 'regular',
      subjectIds: [SUBJECT],
      startMonth: '2026-09',
      endMonth: null,
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      updatedBy: USER,
    });
    return subscription.id;
  }

  beforeEach(async () => {
    subscriptions = new InMemoryStudentSubscriptionRepository();
    students = new InMemoryStudentRepository();
    const seedClock = fakeClock('2026-07-31T10:00:00Z');
    const seedIds = fakeIds();
    const seedPolicy = new PlanPolicy(PLANS.essentiel);
    const invoices = new InMemoryInvoiceRepository();
    create = new CreateStudentSubscription(
      subscriptions,
      students,
      new InMemoryFormulaRepository(),
      new GenerateStudentMonthInvoice(
        invoices,
        new CreateInvoiceDraft(invoices, seedClock, seedIds, seedPolicy),
        seedClock,
        seedIds,
        seedPolicy,
      ),
      seedClock,
      seedIds,
      seedPolicy,
    );
    close = new CloseStudentSubscription(
      subscriptions,
      fakeClock('2026-12-15T10:00:00Z'),
      new PlanPolicy(PLANS.essentiel),
    );
    await students.save(makeStudent());
  });

  describe('happy path', () => {
    it('closes the incumbent the month before and creates the replacement (one operation)', async () => {
      const activeId = await seedOpen();
      const { closed, created } = await replace().execute({
        studentId: STUDENT_ID,
        formulaId: 'fml_00000000000000000000000009',
        kind: 'regular',
        subjectIds: [SUBJECT],
        startMonth: '2027-01',
        endMonth: null,
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        updatedBy: USER,
        activeSubscriptionId: activeId,
      });

      expect(closed.id).toBe(activeId);
      expect(closed.endMonth).toBe('2026-12');
      expect(closed.updatedBy).toBe(USER);

      expect(created.id).not.toBe(activeId);
      expect(created.kind).toBe('regular');
      expect(created.formulaId).toBe('fml_00000000000000000000000009');
      expect(created.startMonth).toBe('2027-01');
      expect(created.endMonth).toBeNull();

      expect((await subscriptions.findById(activeId))?.endMonth).toBe('2026-12');
      expect(await subscriptions.findById(created.id)).not.toBeNull();
    });

    it('yields two contiguous, non-overlapping ranges', async () => {
      const activeId = await seedOpen();
      const { created } = await replace().execute({
        studentId: STUDENT_ID,
        formulaId: 'fml_00000000000000000000000009',
        kind: 'regular',
        subjectIds: [SUBJECT],
        startMonth: '2027-03',
        endMonth: null,
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        updatedBy: USER,
        activeSubscriptionId: activeId,
      });
      const closed = (await subscriptions.findById(activeId))!;
      expect(closed.endMonth).toBe('2027-02');
      expect(created.startMonth).toBe('2027-03');
    });
  });

  describe('overlap guard (at-most-one-active-per-kind)', () => {
    it.each(['2026-08', '2026-09'] as const)(
      'rejects a replacement starting in %s because it is not after the active subscription start month',
      async (startMonth) => {
        const activeId = await seedOpen();

        await expect(
          replace().execute({
            studentId: STUDENT_ID,
            formulaId: 'fml_00000000000000000000000009',
            kind: 'regular',
            subjectIds: [SUBJECT],
            startMonth,
            endMonth: null,
            centerCode: CENTER,
            deviceOrigin: DEVICE,
            updatedBy: USER,
            activeSubscriptionId: activeId,
          }),
        ).rejects.toBeInstanceOf(InvalidSubscriptionReplacementMonthError);
      },
    );

    it('rejects a replacement that overlaps a different live subscription of same kind', async () => {
      const activeId = await seedOpen();
      await close.execute({
        centerCode: CENTER,
        subscriptionId: activeId,
        endMonth: '2026-12',
        updatedBy: USER,
      });
      await create.execute({
        studentId: STUDENT_ID,
        formulaId: 'fml_00000000000000000000000003',
        kind: 'regular',
        subjectIds: [SUBJECT],
        startMonth: '2027-01',
        endMonth: null,
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        updatedBy: USER,
      });

      await expect(
        replace().execute({
          studentId: STUDENT_ID,
          formulaId: 'fml_00000000000000000000000009',
          kind: 'regular',
          subjectIds: [SUBJECT],
          startMonth: '2027-02',
          endMonth: null,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: USER,
          activeSubscriptionId: activeId,
        }),
      ).rejects.toBeInstanceOf(TooManyActiveSubscriptionsError);
    });
  });

  describe('resolution / tenant scoping', () => {
    it('throws StudentSubscriptionNotFoundError for an unknown active subscription', async () => {
      await expect(
        replace().execute({
          studentId: STUDENT_ID,
          formulaId: 'fml_00000000000000000000000009',
          kind: 'regular',
          subjectIds: [SUBJECT],
          startMonth: '2027-01',
          endMonth: null,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: USER,
          activeSubscriptionId: 'ssu_00000000000000000000000099' as StudentSubscriptionId,
        }),
      ).rejects.toBeInstanceOf(StudentSubscriptionNotFoundError);
    });

    it('throws StudentNotFoundError when the active subscription is in another center', async () => {
      const activeId = await seedOpen();
      await expect(
        replace().execute({
          studentId: STUDENT_ID,
          formulaId: 'fml_00000000000000000000000009',
          kind: 'regular',
          subjectIds: [SUBJECT],
          startMonth: '2027-01',
          endMonth: null,
          centerCode: OTHER_CENTER,
          deviceOrigin: DEVICE,
          updatedBy: USER,
          activeSubscriptionId: activeId,
        }),
      ).rejects.toBeInstanceOf(StudentNotFoundError);
    });

    it('throws StudentSubscriptionNotFoundError for an already soft-deleted active subscription', async () => {
      const activeId = await seedOpen();
      await subscriptions.softDelete(activeId, new Date('2026-11-01T00:00:00Z'), USER);
      await expect(
        replace().execute({
          studentId: STUDENT_ID,
          formulaId: 'fml_00000000000000000000000009',
          kind: 'regular',
          subjectIds: [SUBJECT],
          startMonth: '2027-01',
          endMonth: null,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: USER,
          activeSubscriptionId: activeId,
        }),
      ).rejects.toBeInstanceOf(StudentSubscriptionNotFoundError);
    });

    it('throws StudentNotFoundError when the student belongs to another center', async () => {
      const activeId = await seedOpen();
      await expect(
        replace().execute({
          studentId: 'stu_00000000000000000000000009' as StudentId,
          formulaId: 'fml_00000000000000000000000009',
          kind: 'regular',
          subjectIds: [SUBJECT],
          startMonth: '2027-01',
          endMonth: null,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: USER,
          activeSubscriptionId: activeId,
        }),
      ).rejects.toBeInstanceOf(StudentNotFoundError);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.formulas', async () => {
      const activeId = await seedOpen();
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      const useCase = new ReplaceStudentSubscription(
        subscriptions,
        students,
        fakeClock(),
        fakeIds(),
        new PlanPolicy(planWithout),
      );
      await expect(
        useCase.execute({
          studentId: STUDENT_ID,
          formulaId: 'fml_00000000000000000000000009',
          kind: 'regular',
          subjectIds: [SUBJECT],
          startMonth: '2027-01',
          endMonth: null,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: USER,
          activeSubscriptionId: activeId,
        }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });

    it('throws PlanFeatureUnavailableError for exam-prep replace when plan lacks core.exam-prep', async () => {
      const activeId = await seedOpen();
      const useCase = new ReplaceStudentSubscription(
        subscriptions,
        students,
        fakeClock(),
        fakeIds(),
        new PlanPolicy(planWithoutFeature('core.exam-prep')),
      );
      await expect(
        useCase.execute({
          studentId: STUDENT_ID,
          formulaId: 'fml_00000000000000000000000009',
          kind: 'exam-prep',
          subjectIds: [SUBJECT],
          startMonth: '2027-01',
          endMonth: null,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: USER,
          activeSubscriptionId: activeId,
        }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });

  describe('validation', () => {
    it('rejects a malformed startMonth', async () => {
      const activeId = await seedOpen();
      await expect(
        replace().execute({
          studentId: STUDENT_ID,
          formulaId: 'fml_00000000000000000000000009',
          kind: 'regular',
          subjectIds: [SUBJECT],
          startMonth: '2027-13',
          endMonth: null,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: USER,
          activeSubscriptionId: activeId,
        }),
      ).rejects.toThrow();
    });
  });

  describe('atomicity (SOU-141 done-when)', () => {
    it('a create failure after the close leaves the incumbent live, not closed-and-orphaned', async () => {
      const activeId = await seedOpen();
      const createdId = 'sbs_00000000000000000000000042' as StudentSubscriptionId;
      const failing = new FailingCreateSubscriptionRepository(createdId);
      await failing.save((await subscriptions.findById(activeId))!);
      await failing.save(makeStudent());
      const useCase = new ReplaceStudentSubscription(
        failing,
        students,
        fakeClock('2027-01-15T10:00:00Z'),
        fakeIds(42),
        new PlanPolicy(PLANS.essentiel),
      );

      await expect(
        useCase.execute({
          studentId: STUDENT_ID,
          formulaId: 'fml_00000000000000000000000009',
          kind: 'regular',
          subjectIds: [SUBJECT],
          startMonth: '2027-01',
          endMonth: null,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: USER,
          activeSubscriptionId: activeId,
        }),
      ).rejects.toThrow('simulated create failure after close');

      const incumbent = await failing.findById(activeId);
      expect(incumbent?.endMonth).toBeNull();
      expect(incumbent?.deletedAt).toBeNull();
      expect(await failing.findById(createdId)).toBeNull();
    });
  });
});
