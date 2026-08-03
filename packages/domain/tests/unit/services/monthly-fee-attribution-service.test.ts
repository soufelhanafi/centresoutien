import { describe, it, expect, beforeEach } from 'vitest';
import { MonthlyFeeAttributionService } from '../../../src/services/monthly-fee-attribution-service';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Invoice, InvoiceId } from '../../../src/entities/invoice';
import type { InvoiceLine, InvoiceLineId } from '../../../src/entities/invoice-line';
import type { Formula, FormulaId } from '../../../src/entities/formula';
import type { Group, GroupId } from '../../../src/entities/group';
import type { Enrollment, EnrollmentId } from '../../../src/entities/enrollment';
import type { Payment, PaymentId } from '../../../src/entities/payment';
import type { SubjectId } from '../../../src/entities/subject';
import type { StudentId } from '../../../src/entities/student';
import type { TeacherId } from '../../../src/entities/teacher';
import type { RoomId } from '../../../src/entities/room';
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
const PHYSICS = 'sub_00000000000000000000000002' as SubjectId;
const TEACHER_MATH = 'tch_00000000000000000000000001' as TeacherId;
const TEACHER_PHYSICS = 'tch_00000000000000000000000002' as TeacherId;
const ROOM = 'rom_00000000000000000000000001' as RoomId;
const STUDENT = 'stu_00000000000000000000000001' as StudentId;

const ids = fakeIds(1);
const clock = () => fakeClock(CLOCK_ISO);
const envelope = () => newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock());

describe('MonthlyFeeAttributionService', () => {
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
    service = new MonthlyFeeAttributionService(invoices, payments, formulas, enrollments, groups);
  });

  function seedGroup(overrides: Partial<Group> & { subjectId: SubjectId }): Group {
    const group: Group = {
      id: (overrides.id ?? (ids.next('grp') as GroupId)) as GroupId,
      ...envelope(),
      roomId: ROOM,
      level: 'college',
      capacity: 20,
      kind: 'regular',
      active: true,
      teacherId: null,
      ...overrides,
    };
    void groups.save(group);
    return group;
  }

  function seedEnrollment(studentId: StudentId, groupId: GroupId): Enrollment {
    const enrollment: Enrollment = {
      id: ids.next('enr') as EnrollmentId,
      ...envelope(),
      studentId,
      groupId,
      startMonth: '2026-01',
      endMonth: null,
    };
    void enrollments.save(enrollment);
    return enrollment;
  }

  function seedFormula(overrides: Partial<Formula> & { subjectIds: readonly SubjectId[] }): Formula {
    const formula: Formula = {
      id: (overrides.id ?? (ids.next('fml') as FormulaId)) as FormulaId,
      ...envelope(),
      name: { fr: 'Math', ar: 'رياضيات' },
      priceMad: 20000,
      kind: 'regular',
      isImmutable: false,
      active: true,
      ...overrides,
    };
    void formulas.save(formula);
    return formula;
  }

  async function seedIssuedInvoice(
    studentId: StudentId,
    formulaId: FormulaId,
    amountMad: number,
    netPaidMad: number,
  ): Promise<Invoice> {
    const invoice: Invoice = {
      id: ids.next('inv') as InvoiceId,
      ...envelope(),
      studentId,
      month: MONTH,
      status: 'issued',
      issuedAt: clock().now(),
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
    return invoice;
  }

  it('attributes a fully-paid single-subject line to its one teacher', async () => {
    const group = seedGroup({ subjectId: MATH, teacherId: TEACHER_MATH as unknown as EntityId });
    seedEnrollment(STUDENT, group.id);
    const formula = seedFormula({ subjectIds: [MATH] });
    await seedIssuedInvoice(STUDENT, formula.id, 20000, 20000);

    const result = await service.attributedAmountsByTeacher(CENTER, MONTH);

    expect(result.get(TEACHER_MATH)).toBe(20000);
  });

  it('splits an equal-split 2-subject line across each subject’s teacher', async () => {
    const mathGroup = seedGroup({ subjectId: MATH, teacherId: TEACHER_MATH as unknown as EntityId });
    const physicsGroup = seedGroup({ subjectId: PHYSICS, teacherId: TEACHER_PHYSICS as unknown as EntityId });
    seedEnrollment(STUDENT, mathGroup.id);
    seedEnrollment(STUDENT, physicsGroup.id);
    const formula = seedFormula({ subjectIds: [MATH, PHYSICS] });
    await seedIssuedInvoice(STUDENT, formula.id, 30000, 30000);

    const result = await service.attributedAmountsByTeacher(CENTER, MONTH);

    expect(result.get(TEACHER_MATH)).toBe(15000);
    expect(result.get(TEACHER_PHYSICS)).toBe(15000);
  });

  it('only attributes the collected (paid) portion of a partially-paid invoice', async () => {
    const group = seedGroup({ subjectId: MATH, teacherId: TEACHER_MATH as unknown as EntityId });
    seedEnrollment(STUDENT, group.id);
    const formula = seedFormula({ subjectIds: [MATH] });
    await seedIssuedInvoice(STUDENT, formula.id, 20000, 10000); // half paid

    const result = await service.attributedAmountsByTeacher(CENTER, MONTH);

    expect(result.get(TEACHER_MATH)).toBe(10000);
  });

  it('excludes an unpaid issued invoice entirely', async () => {
    const group = seedGroup({ subjectId: MATH, teacherId: TEACHER_MATH as unknown as EntityId });
    seedEnrollment(STUDENT, group.id);
    const formula = seedFormula({ subjectIds: [MATH] });
    await seedIssuedInvoice(STUDENT, formula.id, 20000, 0);

    const result = await service.attributedAmountsByTeacher(CENTER, MONTH);

    expect(result.size).toBe(0);
  });

  it('excludes a draft invoice — only issued invoices count', async () => {
    const group = seedGroup({ subjectId: MATH, teacherId: TEACHER_MATH as unknown as EntityId });
    seedEnrollment(STUDENT, group.id);
    const formula = seedFormula({ subjectIds: [MATH] });
    const invoice: Invoice = {
      id: ids.next('inv') as InvoiceId,
      ...envelope(),
      studentId: STUDENT,
      month: MONTH,
      status: 'draft',
      issuedAt: null,
      cancelledAt: null,
    };
    const line: InvoiceLine = {
      id: ids.next('invl') as InvoiceLineId,
      ...envelope(),
      invoiceId: invoice.id,
      formulaId: formula.id,
      label: { fr: 'Math', ar: 'رياضيات' },
      kind: 'regular',
      amountMad: 20000,
    };
    await invoices.createDraft(invoice, [line]);
    await payments.append({
      id: ids.next('pmt') as PaymentId,
      ...envelope(),
      invoiceId: invoice.id,
      kind: 'payment',
      amountMad: 20000,
      method: 'cash',
      paidOn: '2026-08-05',
      reversesPaymentId: null,
    });

    const result = await service.attributedAmountsByTeacher(CENTER, MONTH);

    expect(result.size).toBe(0);
  });

  it('leaves an unresolvable subject unattributed rather than redistributing its share (SOU-74 M1)', async () => {
    // Student subscribes to Math + Physics but is only enrolled in the Math group.
    const mathGroup = seedGroup({ subjectId: MATH, teacherId: TEACHER_MATH as unknown as EntityId });
    seedEnrollment(STUDENT, mathGroup.id);
    const formula = seedFormula({ subjectIds: [MATH, PHYSICS] });
    await seedIssuedInvoice(STUDENT, formula.id, 30000, 30000);

    const result = await service.attributedAmountsByTeacher(CENTER, MONTH);

    expect(result.get(TEACHER_MATH)).toBe(15000);
    expect(result.get(TEACHER_PHYSICS)).toBeUndefined();
  });

  it('skips a line entirely when zero of its subjects resolve to a teacher', async () => {
    const formula = seedFormula({ subjectIds: [MATH] }); // no group/enrollment seeded at all
    await seedIssuedInvoice(STUDENT, formula.id, 20000, 20000);

    const result = await service.attributedAmountsByTeacher(CENTER, MONTH);

    expect(result.size).toBe(0);
  });

  it('returns an empty map when there are no issued invoices that month', async () => {
    const result = await service.attributedAmountsByTeacher(CENTER, MONTH);
    expect(result.size).toBe(0);
  });

  it('aggregates a teacher’s attribution across multiple students', async () => {
    const group = seedGroup({ subjectId: MATH, teacherId: TEACHER_MATH as unknown as EntityId });
    const studentB = 'stu_00000000000000000000000002' as StudentId;
    seedEnrollment(STUDENT, group.id);
    seedEnrollment(studentB, group.id);
    const formula = seedFormula({ subjectIds: [MATH] });
    await seedIssuedInvoice(STUDENT, formula.id, 20000, 20000);
    await seedIssuedInvoice(studentB, formula.id, 15000, 15000);

    const result = await service.attributedAmountsByTeacher(CENTER, MONTH);

    expect(result.get(TEACHER_MATH)).toBe(35000);
  });

  describe('attributedAmountsBySubject (SOU-100)', () => {
    it('splits a 2-subject line across each subject, regardless of staffing', async () => {
      const mathGroup = seedGroup({ subjectId: MATH, teacherId: TEACHER_MATH as unknown as EntityId });
      // Physics has no group/enrollment seeded — unstaffed, unlike the teacher view
      // this still claims its share.
      seedEnrollment(STUDENT, mathGroup.id);
      const formula = seedFormula({ subjectIds: [MATH, PHYSICS] });
      await seedIssuedInvoice(STUDENT, formula.id, 30000, 30000);

      const result = await service.attributedAmountsBySubject(CENTER, MONTH);

      expect(result.get(MATH)).toBe(15000);
      expect(result.get(PHYSICS)).toBe(15000);
    });

    it('only attributes the collected portion of a partially-paid invoice', async () => {
      const group = seedGroup({ subjectId: MATH, teacherId: TEACHER_MATH as unknown as EntityId });
      seedEnrollment(STUDENT, group.id);
      const formula = seedFormula({ subjectIds: [MATH] });
      await seedIssuedInvoice(STUDENT, formula.id, 20000, 10000);

      const result = await service.attributedAmountsBySubject(CENTER, MONTH);

      expect(result.get(MATH)).toBe(10000);
    });

    it('excludes a draft invoice — only issued invoices count', async () => {
      const formula = seedFormula({ subjectIds: [MATH] });
      const invoice: Invoice = {
        id: ids.next('inv') as InvoiceId,
        ...envelope(),
        studentId: STUDENT,
        month: MONTH,
        status: 'draft',
        issuedAt: null,
        cancelledAt: null,
      };
      const line: InvoiceLine = {
        id: ids.next('invl') as InvoiceLineId,
        ...envelope(),
        invoiceId: invoice.id,
        formulaId: formula.id,
        label: { fr: 'Math', ar: 'رياضيات' },
        kind: 'regular',
        amountMad: 20000,
      };
      await invoices.createDraft(invoice, [line]);

      const result = await service.attributedAmountsBySubject(CENTER, MONTH);

      expect(result.size).toBe(0);
    });

    it('aggregates a subject’s revenue across multiple students', async () => {
      const group = seedGroup({ subjectId: MATH, teacherId: TEACHER_MATH as unknown as EntityId });
      const studentB = 'stu_00000000000000000000000002' as StudentId;
      seedEnrollment(STUDENT, group.id);
      seedEnrollment(studentB, group.id);
      const formula = seedFormula({ subjectIds: [MATH] });
      await seedIssuedInvoice(STUDENT, formula.id, 20000, 20000);
      await seedIssuedInvoice(studentB, formula.id, 15000, 15000);

      const result = await service.attributedAmountsBySubject(CENTER, MONTH);

      expect(result.get(MATH)).toBe(35000);
    });

    it('returns an empty map when there are no issued invoices that month', async () => {
      const result = await service.attributedAmountsBySubject(CENTER, MONTH);
      expect(result.size).toBe(0);
    });
  });
});

describe('MonthlyFeeAttributionService.attributedAmountsByTeacherAndSubject', () => {
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
    service = new MonthlyFeeAttributionService(invoices, payments, formulas, enrollments, groups);
  });

  function seedGroup(overrides: Partial<Group> & { subjectId: SubjectId }): Group {
    const group: Group = {
      id: (overrides.id ?? (ids.next('grp') as GroupId)) as GroupId,
      ...envelope(),
      roomId: ROOM,
      level: 'college',
      capacity: 20,
      kind: 'regular',
      active: true,
      teacherId: null,
      ...overrides,
    };
    void groups.save(group);
    return group;
  }

  function seedEnrollment(studentId: StudentId, groupId: GroupId): Enrollment {
    const enrollment: Enrollment = {
      id: ids.next('enr') as EnrollmentId,
      ...envelope(),
      studentId,
      groupId,
      startMonth: '2026-01',
      endMonth: null,
    };
    void enrollments.save(enrollment);
    return enrollment;
  }

  function seedFormula(overrides: Partial<Formula> & { subjectIds: readonly SubjectId[] }): Formula {
    const formula: Formula = {
      id: (overrides.id ?? (ids.next('fml') as FormulaId)) as FormulaId,
      ...envelope(),
      name: { fr: 'Math', ar: 'رياضيات' },
      priceMad: 20000,
      kind: 'regular',
      isImmutable: false,
      active: true,
      ...overrides,
    };
    void formulas.save(formula);
    return formula;
  }

  async function seedIssuedInvoice(
    studentId: StudentId,
    formulaId: FormulaId,
    amountMad: number,
    netPaidMad: number,
  ): Promise<Invoice> {
    const invoice: Invoice = {
      id: ids.next('inv') as InvoiceId,
      ...envelope(),
      studentId,
      month: MONTH,
      status: 'issued',
      issuedAt: clock().now(),
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
    return invoice;
  }

  it('breaks a single-subject line down to one teacher/subject pair', async () => {
    const group = seedGroup({ subjectId: MATH, teacherId: TEACHER_MATH as unknown as EntityId });
    seedEnrollment(STUDENT, group.id);
    const formula = seedFormula({ subjectIds: [MATH] });
    await seedIssuedInvoice(STUDENT, formula.id, 20000, 20000);

    const result = await service.attributedAmountsByTeacherAndSubject(CENTER, MONTH);

    expect(result.get(TEACHER_MATH)?.get(MATH)).toBe(20000);
  });

  it('keeps a two-subject formula as two separate subject entries under the same teacher', async () => {
    const group = seedGroup({ subjectId: MATH, teacherId: TEACHER_MATH as unknown as EntityId });
    const physicsGroup = seedGroup({ subjectId: PHYSICS, teacherId: TEACHER_MATH as unknown as EntityId });
    seedEnrollment(STUDENT, group.id);
    seedEnrollment(STUDENT, physicsGroup.id);
    const formula = seedFormula({ subjectIds: [MATH, PHYSICS] });
    await seedIssuedInvoice(STUDENT, formula.id, 30000, 30000);

    const result = await service.attributedAmountsByTeacherAndSubject(CENTER, MONTH);

    expect(result.get(TEACHER_MATH)?.get(MATH)).toBe(15000);
    expect(result.get(TEACHER_MATH)?.get(PHYSICS)).toBe(15000);
  });

  it('splits a two-subject line across two different teachers, one subject each', async () => {
    const mathGroup = seedGroup({ subjectId: MATH, teacherId: TEACHER_MATH as unknown as EntityId });
    const physicsGroup = seedGroup({ subjectId: PHYSICS, teacherId: TEACHER_PHYSICS as unknown as EntityId });
    seedEnrollment(STUDENT, mathGroup.id);
    seedEnrollment(STUDENT, physicsGroup.id);
    const formula = seedFormula({ subjectIds: [MATH, PHYSICS] });
    await seedIssuedInvoice(STUDENT, formula.id, 30000, 30000);

    const result = await service.attributedAmountsByTeacherAndSubject(CENTER, MONTH);

    expect(result.get(TEACHER_MATH)?.get(MATH)).toBe(15000);
    expect(result.get(TEACHER_MATH)?.has(PHYSICS)).toBe(false);
    expect(result.get(TEACHER_PHYSICS)?.get(PHYSICS)).toBe(15000);
  });

  it('returns an empty map when there are no issued invoices that month', async () => {
    const result = await service.attributedAmountsByTeacherAndSubject(CENTER, MONTH);
    expect(result.size).toBe(0);
  });
});
