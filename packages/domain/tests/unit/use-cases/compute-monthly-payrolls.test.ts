import { describe, it, expect, beforeEach } from 'vitest';
import {
  ComputeMonthlyPayrolls,
  type ComputeMonthlyPayrollsInput,
} from '../../../src/use-cases/compute-monthly-payrolls';
import { MonthlyFeeAttributionService } from '../../../src/services/monthly-fee-attribution-service';
import { AttributionLineAssembler } from '../../../src/services/attribution-line-assembler';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Teacher, TeacherId } from '../../../src/entities/teacher';
import type { TeacherPayrollRule } from '../../../src/entities/teacher-payroll-rule';
import type { Invoice, InvoiceId } from '../../../src/entities/invoice';
import type { InvoiceLine, InvoiceLineId } from '../../../src/entities/invoice-line';
import type { Formula, FormulaId } from '../../../src/entities/formula';
import type { Group, GroupId } from '../../../src/entities/group';
import type { Enrollment, EnrollmentId } from '../../../src/entities/enrollment';
import type { Payment, PaymentId } from '../../../src/entities/payment';
import type { SubjectId } from '../../../src/entities/subject';

import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import { InMemoryTeacherRepository } from '../fakes/in-memory-teacher-repository';
import { InMemoryTeacherPayrollRuleRepository } from '../fakes/in-memory-teacher-payroll-rule-repository';
import { InMemoryTeacherPayoutRepository } from '../fakes/in-memory-teacher-payout-repository';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { InMemoryPaymentRepository } from '../fakes/in-memory-payment-repository';
import { InMemoryFormulaRepository } from '../fakes/in-memory-formula-repository';
import { InMemoryEnrollmentRepository } from '../fakes/in-memory-enrollment-repository';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const CLOCK_ISO = '2026-08-01T00:00:00Z';
const MONTH = '2026-08';
const MATH = 'sub_00000000000000000000000001' as SubjectId;
const ids = fakeIds(1);
const clock = () => fakeClock(CLOCK_ISO);
const envelope = () => newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock());

describe('ComputeMonthlyPayrolls', () => {
  let teachers: InMemoryTeacherRepository;
  let rules: InMemoryTeacherPayrollRuleRepository;
  let payouts: InMemoryTeacherPayoutRepository;
  let invoices: InMemoryInvoiceRepository;
  let payments: InMemoryPaymentRepository;
  let formulas: InMemoryFormulaRepository;
  let enrollments: InMemoryEnrollmentRepository;
  let groups: InMemoryGroupRepository;

  beforeEach(() => {
    teachers = new InMemoryTeacherRepository();
    rules = new InMemoryTeacherPayrollRuleRepository();
    payouts = new InMemoryTeacherPayoutRepository();
    invoices = new InMemoryInvoiceRepository();
    payments = new InMemoryPaymentRepository();
    formulas = new InMemoryFormulaRepository();
    enrollments = new InMemoryEnrollmentRepository();
    groups = new InMemoryGroupRepository();
  });

  function build(plan: Plan): ComputeMonthlyPayrolls {
    const attribution = new MonthlyFeeAttributionService(
      new AttributionLineAssembler(invoices, payments, formulas, enrollments, groups),
    );
    return new ComputeMonthlyPayrolls(
      teachers,
      rules,
      payouts,
      attribution,
      clock(),
      new PlanPolicy(plan),
    );
  }

  function validInput(overrides: Partial<ComputeMonthlyPayrollsInput> = {}): ComputeMonthlyPayrollsInput {
    return { centerCode: CENTER, month: MONTH, deviceOrigin: DEVICE, updatedBy: USER, ...overrides };
  }

  function seedTeacher(overrides: Partial<Teacher> = {}): Teacher {
    const teacher: Teacher = {
      id: (overrides.id ?? (ids.next('tch') as TeacherId)) as TeacherId,
      ...envelope(),
      naturalKey: 'natural-key',
      name: { fr: 'Prof', ar: 'أستاذ' },
      cin: null,
      phone: '+212612345678' as PhoneNumber,
      email: null,
      subjectIds: [MATH],
      active: true,
      ...overrides,
    };
    void teachers.save(teacher);
    return teacher;
  }

  function seedFixedRule(teacherId: TeacherId, amountMad: number, overrides: Partial<TeacherPayrollRule> = {}) {
    const rule: TeacherPayrollRule = {
      id: ids.next('pyr') as TeacherPayrollRule['id'],
      ...envelope(),
      teacherId,
      kind: 'fixed-monthly',
      amountMad,
      startMonth: '2026-01',
      endMonth: null,
      ...overrides,
    };
    void rules.save(rule);
    return rule;
  }

  function seedPercentageRule(teacherId: TeacherId, percent: number, overrides: Partial<TeacherPayrollRule> = {}) {
    const rule: TeacherPayrollRule = {
      id: ids.next('pyr') as TeacherPayrollRule['id'],
      ...envelope(),
      teacherId,
      kind: 'percentage-of-monthly-fees',
      percent,
      startMonth: '2026-01',
      endMonth: null,
      ...overrides,
    };
    void rules.save(rule);
    return rule;
  }

  /** Seeds one fully-paid, single-subject invoice line taught by `teacherId`, so the percentage-rule path has a non-zero attribution base. */
  async function seedAttributableFeesFor(teacherId: TeacherId, amountMad: number): Promise<void> {
    const group: Group = {
      id: ids.next('grp') as GroupId,
      ...envelope(),
      subjectId: MATH,
      teacherId: teacherId as unknown as EntityId,
      level: 'college',
      capacity: 20,
      kind: 'regular',
      active: true,
    };
    void groups.save(group);
    const enrollment: Enrollment = {
      id: ids.next('enr') as EnrollmentId,
      ...envelope(),
      studentId: 'stu_00000000000000000000000001' as Enrollment['studentId'],
      groupId: group.id,
      startMonth: '2026-01',
      endMonth: null,
    };
    void enrollments.save(enrollment);
    const formula: Formula = {
      id: ids.next('fml') as FormulaId,
      ...envelope(),
      name: { fr: 'Math', ar: 'رياضيات' },
      subjectIds: [MATH],
      priceMad: amountMad,
      kind: 'regular',
      isImmutable: false,
      active: true,
    };
    void formulas.save(formula);
    const invoice: Invoice = {
      id: ids.next('inv') as InvoiceId,
      ...envelope(),
      studentId: enrollment.studentId,
      month: MONTH,
      status: 'issued',
      issuedAt: clock().now(),
      cancelledAt: null,
    };
    const line: InvoiceLine = {
      id: ids.next('invl') as InvoiceLineId,
      ...envelope(),
      invoiceId: invoice.id,
      formulaId: formula.id,
      label: formula.name,
      kind: 'regular',
      amountMad,
    };
    await invoices.createDraft(invoice, [line]);
    await payments.append({
      id: ids.next('pmt') as PaymentId,
      ...envelope(),
      invoiceId: invoice.id,
      kind: 'payment',
      amountMad,
      method: 'cash',
      paidOn: '2026-08-05',
      reversesPaymentId: null,
    } satisfies Payment);
  }

  describe('fixed-monthly rule', () => {
    it('creates a draft payout for exactly the rule amount', async () => {
      const teacher = seedTeacher();
      seedFixedRule(teacher.id, 500000);

      const result = await build(PLANS.pro).execute(validInput());

      expect(result).toEqual({ created: 1, updated: 0, skippedNoRule: 0, skippedAlreadyPaid: 0 });
      const payout = await payouts.findLiveByTeacherMonth(teacher.id, MONTH);
      expect(payout).toMatchObject({ amountMad: 500000, status: 'draft', ruleKind: 'fixed-monthly' });
      expect(payout?.baseAmountMad).toBeNull();
      expect(payout?.percentSnapshot).toBeNull();
    });
  });

  describe('percentage-of-monthly-fees rule', () => {
    it('pays the percent of the attribution base computed for that teacher/month', async () => {
      const teacher = seedTeacher();
      seedPercentageRule(teacher.id, 30);
      await seedAttributableFeesFor(teacher.id, 100000);

      const result = await build(PLANS.pro).execute(validInput());

      expect(result.created).toBe(1);
      const payout = await payouts.findLiveByTeacherMonth(teacher.id, MONTH);
      expect(payout?.amountMad).toBe(30000); // 30% of 100000
      expect(payout?.ruleKind).toBe('percentage-of-monthly-fees');
      expect(payout?.baseAmountMad).toBe(100000);
      expect(payout?.percentSnapshot).toBe(30);
    });

    it('pays zero when the teacher has no attributable fees that month', async () => {
      const teacher = seedTeacher();
      seedPercentageRule(teacher.id, 30);

      const result = await build(PLANS.pro).execute(validInput());

      expect(result.created).toBe(1);
      const payout = await payouts.findLiveByTeacherMonth(teacher.id, MONTH);
      expect(payout?.amountMad).toBe(0);
      expect(payout?.baseAmountMad).toBe(0);
      expect(payout?.percentSnapshot).toBe(30);
    });
  });

  describe('a teacher with no rule active that month', () => {
    it('gets no payout row at all, counted under skippedNoRule', async () => {
      const teacher = seedTeacher();
      seedFixedRule(teacher.id, 500000, { startMonth: '2025-01', endMonth: '2025-12' }); // closed before MONTH

      const result = await build(PLANS.pro).execute(validInput());

      expect(result).toEqual({ created: 0, updated: 0, skippedNoRule: 1, skippedAlreadyPaid: 0 });
      expect(await payouts.findLiveByTeacherMonth(teacher.id, MONTH)).toBeNull();
    });
  });

  describe('idempotency (re-running the job)', () => {
    it('replaces the existing draft in place — zero duplicates on a second run', async () => {
      const teacher = seedTeacher();
      seedFixedRule(teacher.id, 500000);
      const job = build(PLANS.pro);

      const first = await job.execute(validInput());
      expect(first).toEqual({ created: 1, updated: 0, skippedNoRule: 0, skippedAlreadyPaid: 0 });

      const second = await job.execute(validInput());
      expect(second).toEqual({ created: 0, updated: 1, skippedNoRule: 0, skippedAlreadyPaid: 0 });

      const live = payouts.all().filter((p) => p.teacherId === teacher.id && p.month === MONTH && p.deletedAt === null);
      expect(live).toHaveLength(1);
    });

    it('recomputes the amount in place when the underlying rule amount changes between runs', async () => {
      const teacher = seedTeacher();
      seedFixedRule(teacher.id, 500000);
      const job = build(PLANS.pro);
      await job.execute(validInput());

      // Close the old rule and open a fresh one at a different amount (close-and-reopen).
      const liveRules = await rules.listLiveByTeacher(teacher.id);
      await rules.softDelete(liveRules[0]!.id, clock().now(), USER);
      seedFixedRule(teacher.id, 700000);

      await job.execute(validInput());

      const payout = await payouts.findLiveByTeacherMonth(teacher.id, MONTH);
      expect(payout?.amountMad).toBe(700000);
    });

    it('never touches a payout already confirmed paid', async () => {
      const teacher = seedTeacher();
      seedFixedRule(teacher.id, 500000);
      const job = build(PLANS.pro);
      await job.execute(validInput());

      const draft = await payouts.findLiveByTeacherMonth(teacher.id, MONTH);
      await payouts.save({ ...draft!, status: 'paid' });

      const result = await job.execute(validInput());

      expect(result).toEqual({ created: 0, updated: 0, skippedNoRule: 0, skippedAlreadyPaid: 1 });
      const payout = await payouts.findLiveByTeacherMonth(teacher.id, MONTH);
      expect(payout).toMatchObject({ status: 'paid', amountMad: 500000 });
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks payroll.teacher', async () => {
      const teacher = seedTeacher();
      seedFixedRule(teacher.id, 500000);
      const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };

      await expect(build(planWithout).execute(validInput())).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(payouts.all()).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('rejects an invalid month', async () => {
      await expect(build(PLANS.pro).execute(validInput({ month: '2026-13' }))).rejects.toThrow();
    });
  });

  describe('zero active teachers', () => {
    it('returns all-zero counters', async () => {
      const result = await build(PLANS.pro).execute(validInput());
      expect(result).toEqual({ created: 0, updated: 0, skippedNoRule: 0, skippedAlreadyPaid: 0 });
    });
  });
});
