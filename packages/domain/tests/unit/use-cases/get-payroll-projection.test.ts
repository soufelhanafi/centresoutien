import { describe, it, expect, beforeEach } from 'vitest';
import { GetPayrollProjection } from '../../../src/use-cases/get-payroll-projection';
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
import type { StudentId } from '../../../src/entities/student';
import type { PhoneNumber } from '../../../src/value-objects/phone-number';

import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import { InMemoryTeacherRepository } from '../fakes/in-memory-teacher-repository';
import { InMemoryTeacherPayrollRuleRepository } from '../fakes/in-memory-teacher-payroll-rule-repository';
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
const STUDENT = 'stu_00000000000000000000000001' as StudentId;
const ids = fakeIds(1);
const clock = () => fakeClock(CLOCK_ISO);
const envelope = () => newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock());

describe('GetPayrollProjection', () => {
  let teachers: InMemoryTeacherRepository;
  let rules: InMemoryTeacherPayrollRuleRepository;
  let invoices: InMemoryInvoiceRepository;
  let payments: InMemoryPaymentRepository;
  let formulas: InMemoryFormulaRepository;
  let enrollments: InMemoryEnrollmentRepository;
  let groups: InMemoryGroupRepository;

  beforeEach(() => {
    teachers = new InMemoryTeacherRepository();
    rules = new InMemoryTeacherPayrollRuleRepository();
    invoices = new InMemoryInvoiceRepository();
    payments = new InMemoryPaymentRepository();
    formulas = new InMemoryFormulaRepository();
    enrollments = new InMemoryEnrollmentRepository();
    groups = new InMemoryGroupRepository();
  });

  function build(plan: Plan): GetPayrollProjection {
    const attribution = new MonthlyFeeAttributionService(
      new AttributionLineAssembler(invoices, payments, formulas, enrollments, groups),
    );
    return new GetPayrollProjection(teachers, rules, attribution, new PlanPolicy(plan));
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
      niveauIds: [],
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

  /** Seeds a group+enrollment+formula so `teacherId` teaches MATH, ready for a single-subject invoice line. */
  function seedStaffing(teacherId: TeacherId, formulaPriceMad: number): Formula {
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
      studentId: STUDENT,
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
      priceMad: formulaPriceMad,
      kind: 'regular',
      isImmutable: false,
      active: true,
    };
    void formulas.save(formula);
    return formula;
  }

  /** Seeds one single-subject invoice line for MATH, with the given lifecycle status and collected amount. */
  async function seedInvoice(formulaId: FormulaId, amountMad: number, status: Invoice['status'], netPaidMad: number): Promise<void> {
    const invoice: Invoice = {
      id: ids.next('inv') as InvoiceId,
      ...envelope(),
      studentId: STUDENT,
      month: MONTH,
      status,
      issuedAt: status === 'issued' ? clock().now() : null,
      cancelledAt: null,
    };
    const line: InvoiceLine = {
      id: ids.next('invl') as InvoiceLineId,
      ...envelope(),
      invoiceId: invoice.id,
      formulaId,
      label: { fr: 'Math', ar: 'رياضيات' },
      kind: 'regular',
      amountMad,
    };
    await invoices.createDraft(invoice, [line]);
    if (netPaidMad > 0) {
      await payments.append({
        id: ids.next('pmt') as PaymentId,
        ...envelope(),
        invoiceId: invoice.id,
        kind: 'payment',
        amountMad: netPaidMad,
        method: 'cash',
        paidOn: '2026-08-05',
        reversesPaymentId: null,
      } satisfies Payment);
    }
  }

  function projectionFor(result: Awaited<ReturnType<GetPayrollProjection['execute']>>, teacherId: TeacherId) {
    return result.projections.find((entry) => entry.teacherId === teacherId);
  }

  describe('fixed-monthly rule', () => {
    it('projects the flat amount for both collected and projected, with no percent snapshot', async () => {
      const teacher = seedTeacher();
      seedFixedRule(teacher.id, 500000);

      const result = await build(PLANS.pro).execute({ centerCode: CENTER, month: MONTH });

      expect(projectionFor(result, teacher.id)).toEqual({
        teacherId: teacher.id,
        ruleKind: 'fixed-monthly',
        encaisseMad: 500000,
        projeteMad: 500000,
        percentSnapshot: null,
      });
    });
  });

  describe('percentage-of-monthly-fees rule', () => {
    it('projects collected and expected bases identically for a fully-paid issued invoice', async () => {
      const teacher = seedTeacher();
      seedPercentageRule(teacher.id, 30);
      const formula = seedStaffing(teacher.id, 100000);
      await seedInvoice(formula.id, 100000, 'issued', 100000);

      const result = await build(PLANS.pro).execute({ centerCode: CENTER, month: MONTH });

      expect(projectionFor(result, teacher.id)).toMatchObject({
        encaisseMad: 30000,
        projeteMad: 30000,
        percentSnapshot: 30,
      });
    });

    it('counts a mid-month draft invoice toward projected but not collected (SOU-316)', async () => {
      const teacher = seedTeacher();
      seedPercentageRule(teacher.id, 30);
      const formula = seedStaffing(teacher.id, 100000);
      // A draft invoice for the open month: expected full amount, nothing collected yet.
      await seedInvoice(formula.id, 100000, 'draft', 0);

      const result = await build(PLANS.pro).execute({ centerCode: CENTER, month: MONTH });

      expect(projectionFor(result, teacher.id)).toMatchObject({
        encaisseMad: 0,
        projeteMad: 30000,
        percentSnapshot: 30,
      });
    });

    it('projects the full expected amount while collected reflects only the paid portion', async () => {
      const teacher = seedTeacher();
      seedPercentageRule(teacher.id, 50);
      const formula = seedStaffing(teacher.id, 100000);
      await seedInvoice(formula.id, 100000, 'issued', 40000); // partially paid

      const result = await build(PLANS.pro).execute({ centerCode: CENTER, month: MONTH });

      expect(projectionFor(result, teacher.id)).toMatchObject({
        encaisseMad: 20000,
        projeteMad: 50000,
      });
    });

    it('exposes the projected subject breakdown as the basis for the figure', async () => {
      const teacher = seedTeacher();
      seedPercentageRule(teacher.id, 30);
      const formula = seedStaffing(teacher.id, 100000);
      await seedInvoice(formula.id, 100000, 'issued', 100000);

      const result = await build(PLANS.pro).execute({ centerCode: CENTER, month: MONTH });

      expect(result.projectedBreakdown).toEqual([
        { teacherId: teacher.id, subjectId: MATH, amountMad: 100000 },
      ]);
    });

    it('projects zero for both figures when the teacher has no attributable fees', async () => {
      const teacher = seedTeacher();
      seedPercentageRule(teacher.id, 30);

      const result = await build(PLANS.pro).execute({ centerCode: CENTER, month: MONTH });

      expect(projectionFor(result, teacher.id)).toMatchObject({ encaisseMad: 0, projeteMad: 0 });
    });
  });

  describe('a teacher with no rule active that month', () => {
    it('is absent from the projection', async () => {
      const teacher = seedTeacher();
      seedFixedRule(teacher.id, 500000, { startMonth: '2025-01', endMonth: '2025-12' }); // closed before MONTH

      const result = await build(PLANS.pro).execute({ centerCode: CENTER, month: MONTH });

      expect(result.projections).toHaveLength(0);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks payroll.teacher', async () => {
      seedTeacher();
      const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };

      await expect(build(planWithout).execute({ centerCode: CENTER, month: MONTH })).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });
  });
});
