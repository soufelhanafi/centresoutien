import { describe, it, expect, beforeEach } from 'vitest';
import {
  CreateStudentSubscription,
  type CreateStudentSubscriptionInput,
} from '../../../src/use-cases/create-student-subscription';
import { CreateInvoiceDraft } from '../../../src/use-cases/create-invoice-draft';
import { GenerateStudentMonthInvoice } from '../../../src/use-cases/generate-student-month-invoice';
import { IssueInvoice } from '../../../src/use-cases/issue-invoice';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { StudentNotFoundError } from '../../../src/errors/student-errors';
import { TooManyActiveSubscriptionsError } from '../../../src/errors/subscription-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { Student, StudentId } from '../../../src/entities/student';
import type { Formula, FormulaId } from '../../../src/entities/formula';
import type { SubjectId } from '../../../src/entities/subject';
import type { IdGenerator } from '../../../src/ports/id-generator';
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
const FORMULA_ID = 'fml_00000000000000000000000002';
const SUBJECT_MATH = 'sub_00000000000000000000000003';
const SUBJECT_PHYS = 'sub_00000000000000000000000004';
// The use-case clock — the current UTC month every test runs in is 2026-07.
const CLOCK_ISO = '2026-07-31T10:00:00Z';

const envelopeClock = fakeClock('2026-01-01T00:00:00Z');

function makeStudent(overrides: Partial<Student> = {}): Student {
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
    ...overrides,
  };
}

function makeFormula(overrides: Partial<Formula> = {}): Formula {
  return {
    id: FORMULA_ID as FormulaId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    name: { fr: 'Math + Physique', ar: 'رياضيات وفيزياء' },
    subjectIds: [SUBJECT_MATH as SubjectId, SUBJECT_PHYS as SubjectId],
    priceMad: 35000,
    kind: 'regular',
    isImmutable: false,
    active: true,
    ...overrides,
  };
}

function validInput(
  overrides: Partial<CreateStudentSubscriptionInput> = {},
): CreateStudentSubscriptionInput {
  return {
    studentId: STUDENT_ID,
    formulaId: FORMULA_ID,
    kind: 'regular',
    subjectIds: [SUBJECT_MATH, SUBJECT_PHYS],
    startMonth: '2026-09',
    endMonth: null,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

describe('CreateStudentSubscription', () => {
  let subscriptions: InMemoryStudentSubscriptionRepository;
  let students: InMemoryStudentRepository;
  let formulas: InMemoryFormulaRepository;
  let invoices: InMemoryInvoiceRepository;
  let ids: IdGenerator;

  function build(plan: Plan): CreateStudentSubscription {
    const policy = new PlanPolicy(plan);
    const createInvoiceDraft = new CreateInvoiceDraft(invoices, fakeClock(CLOCK_ISO), ids, policy);
    const generateStudentMonthInvoice = new GenerateStudentMonthInvoice(
      invoices,
      createInvoiceDraft,
      fakeClock(CLOCK_ISO),
      ids,
      policy,
    );
    return new CreateStudentSubscription(
      subscriptions,
      students,
      formulas,
      generateStudentMonthInvoice,
      fakeClock(CLOCK_ISO),
      ids,
      policy,
    );
  }

  beforeEach(async () => {
    subscriptions = new InMemoryStudentSubscriptionRepository();
    students = new InMemoryStudentRepository();
    formulas = new InMemoryFormulaRepository();
    invoices = new InMemoryInvoiceRepository();
    ids = fakeIds();
    await students.save(makeStudent());
    await formulas.save(makeFormula());
  });

  describe('happy path', () => {
    it('creates a subscription with the sbs_ prefix, frozen snapshot, and a fresh envelope', async () => {
      const { subscription } = await build(PLANS.essentiel).execute(
        validInput({ startMonth: '2026-09', endMonth: '2027-06' }),
      );

      expect(subscription.id).toMatch(/^sbs_/);
      expect(subscription.studentId).toBe(STUDENT_ID);
      expect(subscription.formulaId).toBe(FORMULA_ID);
      expect(subscription.kind).toBe('regular');
      expect(subscription.subjectIds).toEqual([SUBJECT_MATH, SUBJECT_PHYS]);
      expect(subscription.startMonth).toBe('2026-09');
      expect(subscription.endMonth).toBe('2027-06');
      expect(subscription.centerCode).toBe(CENTER);
      expect(subscription.deviceOrigin).toBe(DEVICE);
      expect(subscription.updatedBy).toBe(USER);
      expect(subscription.createdAt).toEqual(new Date(CLOCK_ISO));
      expect(subscription.updatedAt).toEqual(subscription.createdAt);
      expect(subscription.deletedAt).toBeNull();
      expect(subscription.version).toBe(0);
    });

    it('defaults endMonth to null (open-ended / active) and persists so it can be read back', async () => {
      const { subscription } = await build(PLANS.essentiel).execute(validInput());
      expect(subscription.endMonth).toBeNull();
      expect(await subscriptions.findById(subscription.id)).toEqual(subscription);
    });

    it('allows one active regular AND one active exam-prep subscription at once (different kinds)', async () => {
      await build(PLANS.pro).execute(validInput({ kind: 'regular' }));
      const { subscription: examPrep } = await build(PLANS.pro).execute(
        validInput({ kind: 'exam-prep', subjectIds: [SUBJECT_MATH] }),
      );
      expect(await subscriptions.findById(examPrep.id)).not.toBeNull();
      expect((await subscriptions.listLiveByStudent(STUDENT_ID)).length).toBe(2);
    });
  });

  describe('close-and-reopen (non-overlapping same-kind)', () => {
    it('permits a new regular subscription starting after the prior one was closed', async () => {
      // First runs 2026-09..2026-12 (closed), reopen starts 2027-01 — no overlap.
      const { subscription: first } = await build(PLANS.essentiel).execute(
        validInput({ startMonth: '2026-09', endMonth: '2026-12' }),
      );
      const { subscription: reopened } = await build(PLANS.essentiel).execute(
        validInput({ startMonth: '2027-01', endMonth: null, formulaId: 'fml_00000000000000000000000099' }),
      );
      expect(reopened.id).not.toBe(first.id);
      expect(reopened.formulaId).toBe('fml_00000000000000000000000099');
      expect((await subscriptions.listLiveByStudent(STUDENT_ID)).length).toBe(2);
    });
  });

  describe('at-most-one-active-per-kind invariant', () => {
    it('throws TooManyActiveSubscriptionsError on a second overlapping active regular subscription', async () => {
      await build(PLANS.essentiel).execute(validInput({ startMonth: '2026-09', endMonth: null }));
      await expect(
        build(PLANS.essentiel).execute(validInput({ startMonth: '2026-10', endMonth: null })),
      ).rejects.toBeInstanceOf(TooManyActiveSubscriptionsError);
      // The rejected create did not persist a second row.
      expect((await subscriptions.listLiveByStudent(STUDENT_ID)).length).toBe(1);
    });

    it('carries the studentId and kind on the error', async () => {
      await build(PLANS.essentiel).execute(validInput());
      await expect(build(PLANS.essentiel).execute(validInput())).rejects.toMatchObject({
        code: 'too-many-active-subscriptions',
        studentId: STUDENT_ID,
        kind: 'regular',
      });
    });

    it('rejects an open-ended existing subscription overlapping a bounded new one', async () => {
      await build(PLANS.essentiel).execute(validInput({ startMonth: '2026-09', endMonth: null }));
      await expect(
        build(PLANS.essentiel).execute(validInput({ startMonth: '2027-01', endMonth: '2027-06' })),
      ).rejects.toBeInstanceOf(TooManyActiveSubscriptionsError);
    });

    it('does not count the other kind toward the overlap (regular does not block exam-prep)', async () => {
      await build(PLANS.pro).execute(validInput({ kind: 'regular', startMonth: '2026-09', endMonth: null }));
      const { subscription: examPrep } = await build(PLANS.pro).execute(
        validInput({ kind: 'exam-prep', startMonth: '2026-09', endMonth: null, subjectIds: [SUBJECT_MATH] }),
      );
      expect(await subscriptions.findById(examPrep.id)).not.toBeNull();
    });

    it('does not count a soft-deleted (tombstoned) subscription toward the overlap', async () => {
      const { subscription: first } = await build(PLANS.essentiel).execute(
        validInput({ startMonth: '2026-09', endMonth: null }),
      );
      await subscriptions.softDelete(first.id, new Date('2026-08-01T00:00:00Z'), USER);
      const { subscription: second } = await build(PLANS.essentiel).execute(
        validInput({ startMonth: '2026-09', endMonth: null }),
      );
      expect(second.id).not.toBe(first.id);
      expect(await subscriptions.findById(second.id)).not.toBeNull();
    });

    it('does not count a cancelled (inverted-range) subscription toward the overlap', async () => {
      // Seed a live-but-cancelled subscription directly: end_month before start_month,
      // the zero-month full cancellation CloseStudentSubscription permits. It covers no
      // month, so a fresh same-kind subscription in that window must be allowed.
      const { subscription: first } = await build(PLANS.essentiel).execute(
        validInput({ startMonth: '2026-09', endMonth: null }),
      );
      const cancelled = await subscriptions.findById(first.id);
      await subscriptions.save({ ...cancelled!, endMonth: '2026-08', updatedAt: new Date('2026-08-15T00:00:00Z') });

      const { subscription: second } = await build(PLANS.essentiel).execute(
        validInput({ startMonth: '2026-09', endMonth: null }),
      );
      expect(second.id).not.toBe(first.id);
      expect(await subscriptions.findById(second.id)).not.toBeNull();
      expect((await subscriptions.listLiveByStudent(STUDENT_ID)).length).toBe(2);
    });
  });

  describe('first-invoice hook (SOU-289)', () => {
    it('creates the startMonth draft at full formula price when startMonth is the current month', async () => {
      const { invoice } = await build(PLANS.essentiel).execute(
        validInput({ startMonth: '2026-07' }),
      );

      expect(invoice.outcome).toBe('created');
      const created = await invoices.findByStudentMonth(CENTER, STUDENT_ID, '2026-07');
      expect(created).not.toBeNull();
      expect(invoice.invoiceId).toBe(created!.id);
      expect(created!.status).toBe('draft');
      const lines = await invoices.listLines(created!.id);
      expect(lines).toHaveLength(1);
      expect(lines[0]?.formulaId).toBe(FORMULA_ID);
      expect(lines[0]?.label).toEqual({ fr: 'Math + Physique', ar: 'رياضيات وفيزياء' });
      expect(lines[0]?.kind).toBe('regular');
      // Full formula price — never prorated for a mid-month start.
      expect(lines[0]?.amountMad).toBe(35000);
    });

    it('creates the startMonth draft for a backdated startMonth', async () => {
      const { invoice } = await build(PLANS.essentiel).execute(
        validInput({ startMonth: '2026-05' }),
      );
      expect(invoice.outcome).toBe('created');
      expect(await invoices.findByStudentMonth(CENTER, STUDENT_ID, '2026-05')).not.toBeNull();
    });

    it('defers a future startMonth to the monthly batch (nothing generated)', async () => {
      const { invoice } = await build(PLANS.essentiel).execute(
        validInput({ startMonth: '2026-08' }),
      );
      expect(invoice).toEqual({ outcome: 'deferred-future-month', invoiceId: null });
      expect(invoices.all()).toHaveLength(0);
    });

    it('reports already-billed without a duplicate when the month already carries this formula line', async () => {
      // The month's draft exists (e.g. the batch ran first, or a same-formula
      // close-then-recreate in the same month after a tombstone).
      const { invoice: first } = await build(PLANS.essentiel).execute(
        validInput({ startMonth: '2026-07' }),
      );
      const [live] = await subscriptions.listLiveByStudent(STUDENT_ID);
      await subscriptions.softDelete(live!.id, new Date('2026-07-31T11:00:00Z'), USER);

      const { invoice: second } = await build(PLANS.essentiel).execute(
        validInput({ startMonth: '2026-07' }),
      );

      expect(second.outcome).toBe('already-billed');
      expect(second.invoiceId).toBe(first.invoiceId);
      expect(invoices.all()).toHaveLength(1);
      expect(await invoices.listLines(first.invoiceId!)).toHaveLength(1);
    });

    it('appends a second line to the same draft for a second same-month subscription — never a second invoice', async () => {
      const examFormulaId = 'fml_00000000000000000000000077' as FormulaId;
      await formulas.save(
        makeFormula({
          id: examFormulaId,
          name: { fr: 'Préparation Bac', ar: 'تحضير الباك' },
          subjectIds: [SUBJECT_MATH as SubjectId],
          priceMad: 80000,
          kind: 'exam-prep',
        }),
      );

      const { invoice: first } = await build(PLANS.pro).execute(
        validInput({ startMonth: '2026-07', kind: 'regular' }),
      );
      const { invoice: second } = await build(PLANS.pro).execute(
        validInput({
          startMonth: '2026-07',
          kind: 'exam-prep',
          formulaId: examFormulaId,
          subjectIds: [SUBJECT_MATH],
        }),
      );

      expect(second.outcome).toBe('line-appended');
      expect(second.invoiceId).toBe(first.invoiceId);
      expect(invoices.all()).toHaveLength(1);
      const lines = await invoices.listLines(first.invoiceId!);
      expect(lines).toHaveLength(2);
      expect(lines.map((line) => line.kind).sort()).toEqual(['exam-prep', 'regular']);
      expect(lines.map((line) => line.amountMad).sort((a, b) => a - b)).toEqual([35000, 80000]);
    });

    it('never touches an issued invoice: the subscription is created and the outcome is issued-skipped', async () => {
      const { invoice: first } = await build(PLANS.essentiel).execute(
        validInput({ startMonth: '2026-07', endMonth: '2026-07' }),
      );
      await new IssueInvoice(invoices, fakeClock(CLOCK_ISO), new PlanPolicy(PLANS.essentiel)).execute({
        centerCode: CENTER,
        invoiceId: first.invoiceId!,
        updatedBy: USER,
      });

      const { subscription, invoice } = await build(PLANS.pro).execute(
        validInput({ startMonth: '2026-07', endMonth: null, kind: 'exam-prep', subjectIds: [SUBJECT_MATH] }),
      );

      expect(await subscriptions.findById(subscription.id)).not.toBeNull();
      expect(invoice).toEqual({ outcome: 'issued-skipped', invoiceId: first.invoiceId });
      expect(await invoices.listLines(first.invoiceId!)).toHaveLength(1);
    });

    it('reports formula-unresolved (subscription still created) when the formulaId resolves to no live formula', async () => {
      const { subscription, invoice } = await build(PLANS.essentiel).execute(
        validInput({ startMonth: '2026-07', formulaId: 'fml_00000000000000000000000042' }),
      );
      expect(await subscriptions.findById(subscription.id)).not.toBeNull();
      expect(invoice).toEqual({ outcome: 'formula-unresolved', invoiceId: null });
      expect(invoices.all()).toHaveLength(0);
    });

    it('reports formula-unresolved for a foreign-center formula (no cross-tenant snapshot)', async () => {
      const foreignId = 'fml_00000000000000000000000066' as FormulaId;
      await formulas.save(makeFormula({ id: foreignId, centerCode: OTHER_CENTER }));
      const { invoice } = await build(PLANS.essentiel).execute(
        validInput({ startMonth: '2026-07', formulaId: foreignId }),
      );
      expect(invoice).toEqual({ outcome: 'formula-unresolved', invoiceId: null });
      expect(invoices.all()).toHaveLength(0);
    });

    it('contains a generation failure: the subscription persists and the outcome is generation-failed', async () => {
      const policy = new PlanPolicy(PLANS.essentiel);
      const failingGeneration = {
        execute: async () => {
          throw new Error('repository unavailable');
        },
      };
      const useCase = new CreateStudentSubscription(
        subscriptions,
        students,
        formulas,
        failingGeneration,
        fakeClock(CLOCK_ISO),
        ids,
        policy,
      );

      const { subscription, invoice } = await useCase.execute(validInput({ startMonth: '2026-07' }));

      expect(await subscriptions.findById(subscription.id)).not.toBeNull();
      expect(invoice).toEqual({ outcome: 'generation-failed', invoiceId: null });
    });

    it('reports invoicing-unavailable (subscription still created) when the plan lacks core.invoicing', async () => {
      const { subscription, invoice } = await build(planWithoutFeature('core.invoicing')).execute(
        validInput({ startMonth: '2026-07' }),
      );
      expect(await subscriptions.findById(subscription.id)).not.toBeNull();
      expect(invoice).toEqual({ outcome: 'invoicing-unavailable', invoiceId: null });
      expect(invoices.all()).toHaveLength(0);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.formulas', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(build(planWithout).execute(validInput())).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
      expect((await subscriptions.listLiveByStudent(STUDENT_ID)).length).toBe(0);
    });

    it('throws PlanFeatureUnavailableError for an exam-prep subscription when the plan lacks core.exam-prep', async () => {
      await expect(
        build(planWithoutFeature('core.exam-prep')).execute(
          validInput({ kind: 'exam-prep', subjectIds: [SUBJECT_MATH] }),
        ),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });

    it('allows an exam-prep subscription on Pro (has core.exam-prep)', async () => {
      const { subscription } = await build(PLANS.pro).execute(
        validInput({ kind: 'exam-prep', subjectIds: [SUBJECT_MATH] }),
      );
      expect(subscription.kind).toBe('exam-prep');
    });
  });

  describe('student resolution / tenant scoping', () => {
    it('throws StudentNotFoundError for an unknown student', async () => {
      await expect(
        build(PLANS.essentiel).execute(validInput({ studentId: 'stu_00000000000000000000000099' as StudentId })),
      ).rejects.toBeInstanceOf(StudentNotFoundError);
    });

    it('throws StudentNotFoundError for a student in another center (no cross-tenant subscribe)', async () => {
      const other = 'stu_00000000000000000000000006' as StudentId;
      await students.save(makeStudent({ id: other, centerCode: OTHER_CENTER, naturalKey: 'nk-x' }));
      await expect(
        build(PLANS.essentiel).execute(validInput({ studentId: other })),
      ).rejects.toBeInstanceOf(StudentNotFoundError);
    });

    it('throws StudentNotFoundError for an archived (tombstoned) student', async () => {
      await students.softDelete(STUDENT_ID, new Date('2026-07-30T00:00:00Z'), USER);
      await expect(build(PLANS.essentiel).execute(validInput())).rejects.toBeInstanceOf(
        StudentNotFoundError,
      );
    });
  });

  describe('validation', () => {
    it('rejects a malformed student id', async () => {
      await expect(
        build(PLANS.essentiel).execute(validInput({ studentId: 'not-an-id' as StudentId })),
      ).rejects.toThrow();
    });

    it('rejects a malformed formula id', async () => {
      await expect(
        build(PLANS.essentiel).execute(validInput({ formulaId: 'not-an-id' })),
      ).rejects.toThrow();
    });

    it('rejects an empty subjectIds bundle', async () => {
      await expect(
        build(PLANS.essentiel).execute(validInput({ subjectIds: [] })),
      ).rejects.toThrow();
    });

    it('rejects an invalid startMonth', async () => {
      await expect(
        build(PLANS.essentiel).execute(validInput({ startMonth: '2026-13' })),
      ).rejects.toThrow();
    });

    it('rejects an endMonth before startMonth', async () => {
      await expect(
        build(PLANS.essentiel).execute(validInput({ startMonth: '2026-09', endMonth: '2026-08' })),
      ).rejects.toThrow();
    });

    it('accepts a single-month subscription where endMonth equals startMonth', async () => {
      const { subscription } = await build(PLANS.essentiel).execute(
        validInput({ startMonth: '2026-09', endMonth: '2026-09' }),
      );
      expect(subscription.startMonth).toBe('2026-09');
      expect(subscription.endMonth).toBe('2026-09');
    });
  });
});
