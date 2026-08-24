import { describe, it, expect, beforeEach } from 'vitest';
import { MonthlyFeeAttributionService } from '../../../src/services/monthly-fee-attribution-service';
import { AttributionLineAssembler } from '../../../src/services/attribution-line-assembler';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Invoice, InvoiceId, InvoiceSubjectAllocation } from '../../../src/entities/invoice';
import type { InvoiceLine, InvoiceLineId } from '../../../src/entities/invoice-line';
import type { Formula, FormulaId } from '../../../src/entities/formula';
import type { Group, GroupId } from '../../../src/entities/group';
import type { Enrollment, EnrollmentId } from '../../../src/entities/enrollment';
import type { Payment, PaymentId } from '../../../src/entities/payment';
import type { SubjectId } from '../../../src/entities/subject';
import type { StudentId } from '../../../src/entities/student';
import type { TeacherId } from '../../../src/entities/teacher';
import type { EntityId, CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
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
const FR = 'sub_00000000000000000000000002' as SubjectId;
const PHYSICS = 'sub_00000000000000000000000003' as SubjectId;
const TEACHER_MATH = 'tch_00000000000000000000000001' as TeacherId;
const TEACHER_FR = 'tch_00000000000000000000000002' as TeacherId;
const TEACHER_PHYSICS = 'tch_00000000000000000000000003' as TeacherId;
const STUDENT = 'stu_00000000000000000000000001' as StudentId;

const ids = fakeIds(1);
const clock = () => fakeClock(CLOCK_ISO);
const envelope = () => newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock());

describe('MonthlyFeeAttributionService — weighted attribution (SOU-298)', () => {
  let invoices: InMemoryInvoiceRepository;
  let payments: InMemoryPaymentRepository;
  let formulas: InMemoryFormulaRepository;
  let enrollments: InMemoryEnrollmentRepository;
  let groups: InMemoryGroupRepository;
  let service: MonthlyFeeAttributionService;

  beforeEach(() => {
    invoices = new InMemoryInvoiceRepository();
    payments = new InMemoryPaymentRepository();
    formulas = new InMemoryFormulaRepository();
    enrollments = new InMemoryEnrollmentRepository();
    groups = new InMemoryGroupRepository();
    service = new MonthlyFeeAttributionService(
      new AttributionLineAssembler(invoices, payments, formulas, enrollments, groups),
    );
  });

  function seedMathAndFrGroups(): void {
    const mathGroup: Group = {
      id: ids.next('grp') as GroupId,
      ...envelope(),
      subjectId: MATH,
      level: 'college',
      capacity: 20,
      kind: 'regular',
      active: true,
      teacherId: TEACHER_MATH as unknown as EntityId,
    };
    const frGroup: Group = {
      id: ids.next('grp') as GroupId,
      ...envelope(),
      subjectId: FR,
      level: 'college',
      capacity: 20,
      kind: 'regular',
      active: true,
      teacherId: TEACHER_FR as unknown as EntityId,
    };
    void groups.save(mathGroup);
    void groups.save(frGroup);
    for (const groupId of [mathGroup.id, frGroup.id]) {
      const enrollment: Enrollment = {
        id: ids.next('enr') as EnrollmentId,
        ...envelope(),
        studentId: STUDENT,
        groupId,
        startMonth: '2026-01',
        endMonth: null,
      };
      void enrollments.save(enrollment);
    }
  }

  function seedFormula(subjectPrices?: readonly { subjectId: SubjectId; priceMad: number }[]): Formula {
    const formula: Formula = {
      id: ids.next('fml') as FormulaId,
      ...envelope(),
      name: { fr: 'Math + Français', ar: '' },
      subjectIds: [MATH, FR],
      priceMad: 90000,
      ...(subjectPrices !== undefined && { subjectPrices }),
      kind: 'regular',
      isImmutable: false,
      active: true,
    };
    void formulas.save(formula);
    return formula;
  }

  async function seedInvoice(
    formulaId: FormulaId,
    netPaidMad: number,
    subjectAllocation: readonly InvoiceSubjectAllocation[] | null,
  ): Promise<void> {
    const invoice: Invoice = {
      id: ids.next('inv') as InvoiceId,
      ...envelope(),
      studentId: STUDENT,
      month: MONTH,
      status: 'issued',
      issuedAt: clock().now(),
      cancelledAt: null,
      subjectAllocation,
    };
    const line: InvoiceLine = {
      id: ids.next('invl') as InvoiceLineId,
      ...envelope(),
      invoiceId: invoice.id,
      formulaId,
      label: { fr: 'Math + Français', ar: '' },
      kind: 'regular',
      amountMad: 90000,
    };
    await invoices.createDraft(invoice, [line]);
    if (netPaidMad > 0) {
      const payment: Payment = {
        id: ids.next('pmt') as PaymentId,
        ...envelope(),
        invoiceId: invoice.id,
        kind: 'payment',
        amountMad: netPaidMad,
        method: 'cash',
        paidOn: '2026-08-05',
        reversesPaymentId: null,
      };
      await payments.append(payment);
    }
  }

  it('splits a fully-paid line by the formula price map, not equally', async () => {
    seedMathAndFrGroups();
    const formula = seedFormula([
      { subjectId: MATH, priceMad: 44000 },
      { subjectId: FR, priceMad: 46000 },
    ]);
    await seedInvoice(formula.id, 90000, null);

    const result = await service.attributedAmountsByTeacher(CENTER, MONTH);

    expect(result.get(TEACHER_MATH)).toBe(44000);
    expect(result.get(TEACHER_FR)).toBe(46000);
  });

  it('falls back to the equal split when the formula has no price map', async () => {
    seedMathAndFrGroups();
    const formula = seedFormula(); // no subjectPrices
    await seedInvoice(formula.id, 90000, null);

    const result = await service.attributedAmountsByTeacher(CENTER, MONTH);

    expect(result.get(TEACHER_MATH)).toBe(45000);
    expect(result.get(TEACHER_FR)).toBe(45000);
  });

  it('pro-rates a partially-paid line by the price-map weights (Option A)', async () => {
    seedMathAndFrGroups();
    const formula = seedFormula([
      { subjectId: MATH, priceMad: 44000 },
      { subjectId: FR, priceMad: 46000 },
    ]);
    await seedInvoice(formula.id, 45000, null); // half paid

    const result = await service.attributedAmountsByTeacher(CENTER, MONTH);

    // 45000 * 44000/90000 = 22000; 45000 * 46000/90000 = 23000; sum 45000.
    expect(result.get(TEACHER_MATH)).toBe(22000);
    expect(result.get(TEACHER_FR)).toBe(23000);
  });

  function seedGroupWithEnrollment(subjectId: SubjectId, teacherId: TeacherId): void {
    const group: Group = {
      id: ids.next('grp') as GroupId,
      ...envelope(),
      subjectId,
      level: 'college',
      capacity: 20,
      kind: 'regular',
      active: true,
      teacherId: teacherId as unknown as EntityId,
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
  }

  function seedFormulaFor(
    name: string,
    subjectIds: readonly SubjectId[],
    priceMad: number,
  ): Formula {
    const formula: Formula = {
      id: ids.next('fml') as FormulaId,
      ...envelope(),
      name: { fr: name, ar: '' },
      subjectIds,
      priceMad,
      kind: 'regular',
      isImmutable: false,
      active: true,
    };
    void formulas.save(formula);
    return formula;
  }

  // A manual per-invoice allocation is INVOICE-WIDE: it splits the invoice's total
  // collected amount across its subjects, NOT each line independently. On a two-line
  // invoice (Math+Français line 90000, Physique line 10000) a director weighting
  // Math=10 / Français=10 / Physique=80 intends 10000 / 10000 / 80000 of the 100000
  // collected — not the per-line 45000 / 45000 / 10000 the old per-line code produced.
  it('applies a manual allocation invoice-wide across multiple lines (Finding 4)', async () => {
    seedGroupWithEnrollment(MATH, TEACHER_MATH);
    seedGroupWithEnrollment(FR, TEACHER_FR);
    seedGroupWithEnrollment(PHYSICS, TEACHER_PHYSICS);

    const mathFrFormula = seedFormulaFor('Math + Français', [MATH, FR], 90000);
    const physicsFormula = seedFormulaFor('Physique', [PHYSICS], 10000);

    const invoice: Invoice = {
      id: ids.next('inv') as InvoiceId,
      ...envelope(),
      studentId: STUDENT,
      month: MONTH,
      status: 'issued',
      issuedAt: clock().now(),
      cancelledAt: null,
      subjectAllocation: [
        { subjectId: MATH, amountMad: 10 },
        { subjectId: FR, amountMad: 10 },
        { subjectId: PHYSICS, amountMad: 80 },
      ],
    };
    const lineA: InvoiceLine = {
      id: ids.next('invl') as InvoiceLineId,
      ...envelope(),
      invoiceId: invoice.id,
      formulaId: mathFrFormula.id,
      label: { fr: 'Math + Français', ar: '' },
      kind: 'regular',
      amountMad: 90000,
    };
    const lineB: InvoiceLine = {
      id: ids.next('invl') as InvoiceLineId,
      ...envelope(),
      invoiceId: invoice.id,
      formulaId: physicsFormula.id,
      label: { fr: 'Physique', ar: '' },
      kind: 'regular',
      amountMad: 10000,
    };
    await invoices.createDraft(invoice, [lineA, lineB]);
    await payments.append({
      id: ids.next('pmt') as PaymentId,
      ...envelope(),
      invoiceId: invoice.id,
      kind: 'payment',
      amountMad: 100000,
      method: 'cash',
      paidOn: '2026-08-05',
      reversesPaymentId: null,
    });

    const result = await service.attributedAmountsByTeacher(CENTER, MONTH);

    expect(result.get(TEACHER_MATH)).toBe(10000);
    expect(result.get(TEACHER_FR)).toBe(10000);
    expect(result.get(TEACHER_PHYSICS)).toBe(80000);
  });

  it('uses a manual per-invoice allocation over the formula price map', async () => {
    seedMathAndFrGroups();
    const formula = seedFormula([
      { subjectId: MATH, priceMad: 44000 },
      { subjectId: FR, priceMad: 46000 },
    ]);
    await seedInvoice(formula.id, 90000, [
      { subjectId: MATH, amountMad: 10000 },
      { subjectId: FR, amountMad: 80000 },
    ]);

    const result = await service.attributedAmountsByTeacher(CENTER, MONTH);

    expect(result.get(TEACHER_MATH)).toBe(10000);
    expect(result.get(TEACHER_FR)).toBe(80000);
  });

  it('pro-rates the manual allocation when the invoice is partially paid', async () => {
    seedMathAndFrGroups();
    const formula = seedFormula([
      { subjectId: MATH, priceMad: 44000 },
      { subjectId: FR, priceMad: 46000 },
    ]);
    // Manual weights 10000:80000 (=1:8); half of 90000 collected = 45000.
    await seedInvoice(formula.id, 45000, [
      { subjectId: MATH, amountMad: 10000 },
      { subjectId: FR, amountMad: 80000 },
    ]);

    const result = await service.attributedAmountsByTeacher(CENTER, MONTH);

    // 45000 * 10000/90000 = 5000; 45000 * 80000/90000 = 40000; sum 45000.
    expect(result.get(TEACHER_MATH)).toBe(5000);
    expect(result.get(TEACHER_FR)).toBe(40000);
  });
});
