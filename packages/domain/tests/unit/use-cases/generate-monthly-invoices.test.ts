import { describe, it, expect, beforeEach } from 'vitest';
import {
  GenerateMonthlyInvoices,
  type GenerateMonthlyInvoicesInput,
} from '../../../src/use-cases/generate-monthly-invoices';
import { CreateInvoiceDraft } from '../../../src/use-cases/create-invoice-draft';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { StudentSubscription } from '../../../src/entities/student-subscription';
import type { Formula } from '../../../src/entities/formula';
import type { StudentId } from '../../../src/entities/student';
import type { FormulaId } from '../../../src/entities/formula';
import type { SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryStudentSubscriptionRepository } from '../fakes/in-memory-student-subscription-repository';
import { InMemoryFormulaRepository } from '../fakes/in-memory-formula-repository';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const SUBJECT_MATH = 'sub_00000000000000000000000001' as SubjectId;
const CLOCK_ISO = '2026-07-28T10:00:00Z';

const seedIds = fakeIds(1);

function seedFormula(
  formulas: InMemoryFormulaRepository,
  overrides: Partial<Formula> = {},
): Formula {
  const clock = fakeClock(CLOCK_ISO);
  const id = overrides.id ?? (seedIds.next('fml') as FormulaId);
  const formula: Formula = {
    id,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock),
    name: { fr: 'Math', ar: 'رياضيات' },
    subjectIds: [SUBJECT_MATH],
    priceMad: 20000,
    kind: 'regular',
    isImmutable: false,
    active: true,
    ...overrides,
  };
  void formulas.save(formula);
  return formula;
}

function seedSubscription(
  subscriptions: InMemoryStudentSubscriptionRepository,
  overrides: Partial<StudentSubscription> & { studentId: StudentId; formulaId: FormulaId },
): StudentSubscription {
  const clock = fakeClock(CLOCK_ISO);
  const id = overrides.id ?? (seedIds.next('sbs') as StudentSubscription['id']);
  const subscription: StudentSubscription = {
    id,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock),
    kind: 'regular',
    subjectIds: [SUBJECT_MATH],
    startMonth: '2026-08',
    endMonth: null,
    ...overrides,
  };
  void subscriptions.save(subscription);
  return subscription;
}

describe('GenerateMonthlyInvoices', () => {
  let subscriptions: InMemoryStudentSubscriptionRepository;
  let formulas: InMemoryFormulaRepository;
  let invoices: InMemoryInvoiceRepository;

  function build(plan: Plan): GenerateMonthlyInvoices {
    const createInvoiceDraft = new CreateInvoiceDraft(
      invoices,
      fakeClock(CLOCK_ISO),
      fakeIds(1),
      new PlanPolicy(plan),
    );
    return new GenerateMonthlyInvoices(subscriptions, formulas, createInvoiceDraft, new PlanPolicy(plan));
  }

  function validInput(overrides: Partial<GenerateMonthlyInvoicesInput> = {}): GenerateMonthlyInvoicesInput {
    return {
      centerCode: CENTER,
      month: '2026-09',
      deviceOrigin: DEVICE,
      updatedBy: USER,
      ...overrides,
    };
  }

  beforeEach(() => {
    subscriptions = new InMemoryStudentSubscriptionRepository();
    formulas = new InMemoryFormulaRepository();
    invoices = new InMemoryInvoiceRepository();
  });

  describe('happy path', () => {
    it('generates one draft per student with an active subscription that month', async () => {
      const formula = seedFormula(formulas, { priceMad: 20000 });
      const studentA = 'stu_00000000000000000000000001' as StudentId;
      const studentB = 'stu_00000000000000000000000002' as StudentId;
      seedSubscription(subscriptions, { studentId: studentA, formulaId: formula.id });
      seedSubscription(subscriptions, { studentId: studentB, formulaId: formula.id });

      const result = await build(PLANS.essentiel).execute(validInput());

      expect(result).toEqual({ created: 2, skipped: 0 });
      expect(await invoices.findByStudentMonth(CENTER, studentA, '2026-09')).not.toBeNull();
      expect(await invoices.findByStudentMonth(CENTER, studentB, '2026-09')).not.toBeNull();
    });

    it('snapshots the label and price from the formula onto the invoice line', async () => {
      const formula = seedFormula(formulas, {
        name: { fr: 'Math + Physique', ar: 'رياضيات وفيزياء' },
        priceMad: 35000,
      });
      const student = 'stu_00000000000000000000000001' as StudentId;
      seedSubscription(subscriptions, { studentId: student, formulaId: formula.id });

      await build(PLANS.essentiel).execute(validInput());

      const invoice = await invoices.findByStudentMonth(CENTER, student, '2026-09');
      const lines = await invoices.listLines(invoice!.id);
      expect(lines).toHaveLength(1);
      expect(lines[0]?.label).toEqual({ fr: 'Math + Physique', ar: 'رياضيات وفيزياء' });
      expect(lines[0]?.amountMad).toBe(35000);
      expect(lines[0]?.formulaId).toBe(formula.id);
    });

    it('skips a subscription outside the requested month', async () => {
      const formula = seedFormula(formulas);
      const student = 'stu_00000000000000000000000001' as StudentId;
      seedSubscription(subscriptions, {
        studentId: student,
        formulaId: formula.id,
        startMonth: '2026-01',
        endMonth: '2026-06',
      });

      const result = await build(PLANS.essentiel).execute(validInput({ month: '2026-09' }));

      expect(result).toEqual({ created: 0, skipped: 0 });
    });

    it('is center-scoped: a foreign center’s subscriptions never produce an invoice', async () => {
      const formula = seedFormula(formulas, { centerCode: OTHER_CENTER });
      const student = 'stu_00000000000000000000000001' as StudentId;
      seedSubscription(subscriptions, {
        studentId: student,
        formulaId: formula.id,
        centerCode: OTHER_CENTER,
      });

      const result = await build(PLANS.essentiel).execute(validInput({ centerCode: CENTER }));

      expect(result).toEqual({ created: 0, skipped: 0 });
    });
  });

  describe('a student on both tracks', () => {
    it('bundles the regular and exam-prep lines onto one invoice', async () => {
      const regularFormula = seedFormula(formulas, {
        name: { fr: 'Math', ar: 'رياضيات' },
        priceMad: 20000,
        kind: 'regular',
      });
      const examPrepFormula = seedFormula(formulas, {
        name: { fr: 'Préparation Bac', ar: 'تحضير الباك' },
        priceMad: 80000,
        kind: 'exam-prep',
      });
      const student = 'stu_00000000000000000000000001' as StudentId;
      seedSubscription(subscriptions, {
        studentId: student,
        formulaId: regularFormula.id,
        kind: 'regular',
      });
      seedSubscription(subscriptions, {
        studentId: student,
        formulaId: examPrepFormula.id,
        kind: 'exam-prep',
      });

      const result = await build(PLANS.essentiel).execute(validInput());

      expect(result).toEqual({ created: 1, skipped: 0 });
      const invoice = await invoices.findByStudentMonth(CENTER, student, '2026-09');
      const lines = await invoices.listLines(invoice!.id);
      expect(lines).toHaveLength(2);
      expect(lines.map((l) => l.kind).sort()).toEqual(['exam-prep', 'regular']);
    });
  });

  describe('idempotency (re-running the job)', () => {
    it('produces zero new drafts for a month that was already generated', async () => {
      const formula = seedFormula(formulas);
      const studentA = 'stu_00000000000000000000000001' as StudentId;
      const studentB = 'stu_00000000000000000000000002' as StudentId;
      seedSubscription(subscriptions, { studentId: studentA, formulaId: formula.id });
      seedSubscription(subscriptions, { studentId: studentB, formulaId: formula.id });

      // One job instance, run twice — mirrors two runs sharing the same id
      // generator, the way two separate app launches would each mint fresh ids.
      const job = build(PLANS.essentiel);
      const first = await job.execute(validInput());
      expect(first).toEqual({ created: 2, skipped: 0 });

      const second = await job.execute(validInput());
      expect(second).toEqual({ created: 0, skipped: 2 });

      expect(invoices.all().filter((i) => i.month === '2026-09')).toHaveLength(2);
    });

    it('still creates a draft for a newly-eligible student while skipping the already-billed one', async () => {
      const formula = seedFormula(formulas);
      const studentA = 'stu_00000000000000000000000001' as StudentId;
      const studentB = 'stu_00000000000000000000000002' as StudentId;
      seedSubscription(subscriptions, { studentId: studentA, formulaId: formula.id });

      const job = build(PLANS.essentiel);
      await job.execute(validInput());
      seedSubscription(subscriptions, { studentId: studentB, formulaId: formula.id });

      const result = await job.execute(validInput());
      expect(result).toEqual({ created: 1, skipped: 1 });
    });
  });

  describe('zero eligible students', () => {
    it('returns { created: 0, skipped: 0 } when no subscription is active that month', async () => {
      const result = await build(PLANS.essentiel).execute(validInput());
      expect(result).toEqual({ created: 0, skipped: 0 });
      expect(invoices.all()).toHaveLength(0);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.invoicing', async () => {
      const formula = seedFormula(formulas);
      seedSubscription(subscriptions, {
        studentId: 'stu_00000000000000000000000001' as StudentId,
        formulaId: formula.id,
      });
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };

      await expect(build(planWithout).execute(validInput())).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
      expect(invoices.all()).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('rejects an invalid month', async () => {
      await expect(
        build(PLANS.essentiel).execute(validInput({ month: '2026-13' })),
      ).rejects.toThrow();
    });
  });
});
