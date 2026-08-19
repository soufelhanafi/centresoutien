import { describe, it, expect, beforeEach } from 'vitest';
import { GetParentMonthlyStatement } from '../../../src/use-cases/get-parent-monthly-statement';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { ParentNotFoundError } from '../../../src/errors/people-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Parent, ParentId } from '../../../src/entities/parent';
import type { Student, StudentId } from '../../../src/entities/student';
import type { Invoice, InvoiceId, InvoiceStatus } from '../../../src/entities/invoice';
import type { InvoiceLine, InvoiceLineId } from '../../../src/entities/invoice-line';
import type { FormulaId } from '../../../src/entities/formula';
import type { GroupKind } from '../../../src/entities/group';
import type { PhoneNumber } from '../../../src/value-objects/phone-number';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryParentRepository } from '../fakes/in-memory-parent-repository';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const DAD = 'prt_00000000000000000000000001' as ParentId;
const MONTH = '2026-09';

const clock = fakeClock('2026-08-01T10:00:00Z');

function envelope(centerCode: CenterCode = CENTER) {
  return newEnvelope({ centerCode, deviceOrigin: DEVICE, updatedBy: USER }, clock);
}

function makeParent(over: Partial<Parent> = {}): Parent {
  return {
    id: DAD,
    ...envelope(),
    naturalKey: 'CS-CASA-001::alaoui::+212600000001',
    name: 'M. Alaoui',
    phone: '+212600000001' as PhoneNumber,
    email: null,
    relation: 'pere',
    whatsappOptIn: false,
    ...over,
  };
}

let studentSeq = 0;
function makeStudent(nameFr: string, over: Partial<Student> = {}): Student {
  studentSeq += 1;
  return {
    id: `stu_${String(studentSeq).padStart(26, '0')}` as StudentId,
    ...envelope(over.centerCode ?? CENTER),
    naturalKey: `key-${studentSeq}`,
    name: { fr: nameFr, ar: nameFr },
    birthDate: '2012-01-01',
    level: '1AC',
    school: null,
    notes: null,
    guardianIds: [DAD],
    niveauId: null,
    ...over,
  };
}

let lineSeq = 0;
function makeLine(invoiceId: InvoiceId, kind: GroupKind, amountMad: number): InvoiceLine {
  lineSeq += 1;
  return {
    id: `invl_${String(lineSeq).padStart(26, '0')}` as InvoiceLineId,
    ...envelope(),
    invoiceId,
    formulaId: 'fml_00000000000000000000000009' as FormulaId,
    label: { fr: kind === 'regular' ? 'Math' : 'Prépa Bac', ar: 'x' },
    kind,
    amountMad,
  };
}

let invoiceSeq = 0;
function makeInvoice(studentId: StudentId, status: InvoiceStatus = 'issued'): Invoice {
  invoiceSeq += 1;
  return {
    id: `inv_${String(invoiceSeq).padStart(26, '0')}` as InvoiceId,
    ...envelope(),
    studentId,
    month: MONTH,
    status,
    issuedAt: status === 'issued' ? new Date('2026-08-01T10:00:00Z') : null,
    cancelledAt: status === 'cancelled' ? new Date('2026-08-01T10:00:00Z') : null,
  };
}

describe('GetParentMonthlyStatement', () => {
  let parents: InMemoryParentRepository;
  let students: InMemoryStudentRepository;
  let invoices: InMemoryInvoiceRepository;

  function build(plan: Plan = PLANS.premium): GetParentMonthlyStatement {
    return new GetParentMonthlyStatement(parents, students, invoices, new PlanPolicy(plan));
  }

  beforeEach(async () => {
    parents = new InMemoryParentRepository();
    students = new InMemoryStudentRepository();
    invoices = new InMemoryInvoiceRepository();
    await parents.save(makeParent());
  });

  it('builds one block per child, sorted by French name, with the child invoice number', async () => {
    const zaid = makeStudent('Zaid Alaoui');
    const amine = makeStudent('Amine Alaoui');
    await students.save(zaid);
    await students.save(amine);
    const invZaid = makeInvoice(zaid.id);
    await invoices.createDraft(invZaid, [makeLine(invZaid.id, 'regular', 20000)]);
    const invAmine = makeInvoice(amine.id);
    await invoices.createDraft(invAmine, [makeLine(invAmine.id, 'regular', 15000)]);

    const view = await build().execute({ centerCode: CENTER, parentId: DAD, month: MONTH });

    expect(view.parentName).toBe('M. Alaoui');
    expect(view.perChild.map((c) => c.childName.fr)).toEqual(['Amine Alaoui', 'Zaid Alaoui']);
    expect(view.perChild[0]?.invoiceId).toBe(invAmine.id);
    expect(view.perChild[1]?.invoiceId).toBe(invZaid.id);
  });

  it('renders a zero-invoice child block (« Aucune facture ») rather than omitting it', async () => {
    const zaid = makeStudent('Zaid Alaoui');
    const amine = makeStudent('Amine Alaoui');
    await students.save(zaid);
    await students.save(amine);
    const inv = makeInvoice(zaid.id);
    await invoices.createDraft(inv, [makeLine(inv.id, 'regular', 20000)]);
    invoices.setNetPaid(inv.id, 20000);

    const view = await build().execute({ centerCode: CENTER, parentId: DAD, month: MONTH });

    const amineBlock = view.perChild.find((c) => c.childName.fr === 'Amine Alaoui');
    expect(amineBlock?.invoiceId).toBeNull();
    expect(amineBlock?.invoiceStatus).toBeNull();
    expect(amineBlock?.regularLines).toEqual([]);
    expect(amineBlock?.childTotalMad).toBe(0);
    // A no-invoice child contributes 0 and does not block the aggregate "paid".
    expect(view.grandTotalMad).toBe(20000);
    expect(view.aggregateStatus).toBe('paid');
  });

  it('splits regular vs exam-prep lines with per-kind subtotals and a child total', async () => {
    const student = makeStudent('Sara Alaoui');
    await students.save(student);
    const inv = makeInvoice(student.id);
    await invoices.createDraft(inv, [
      makeLine(inv.id, 'regular', 20000),
      makeLine(inv.id, 'regular', 5000),
      makeLine(inv.id, 'exam-prep', 80000),
    ]);
    invoices.setNetPaid(inv.id, 30000);

    const view = await build().execute({ centerCode: CENTER, parentId: DAD, month: MONTH });

    const block = view.perChild[0]!;
    expect(block.regularSubtotalMad).toBe(25000);
    expect(block.examPrepSubtotalMad).toBe(80000);
    expect(block.childTotalMad).toBe(105000);
    expect(block.childNetPaidMad).toBe(30000);
    expect(block.childOutstandingMad).toBe(75000);
    expect(block.childStatus).toBe('partially-paid');
  });

  it('sums a single child into the grand total', async () => {
    const student = makeStudent('Sara Alaoui');
    await students.save(student);
    const inv = makeInvoice(student.id);
    await invoices.createDraft(inv, [makeLine(inv.id, 'regular', 40000)]);
    invoices.setNetPaid(inv.id, 40000);

    const view = await build().execute({ centerCode: CENTER, parentId: DAD, month: MONTH });

    expect(view.perChild).toHaveLength(1);
    expect(view.grandTotalMad).toBe(40000);
    expect(view.totalReceivedMad).toBe(40000);
    expect(view.outstandingMad).toBe(0);
    expect(view.aggregateStatus).toBe('paid');
  });

  it('returns an empty statement for a guardian with no children', async () => {
    const view = await build().execute({ centerCode: CENTER, parentId: DAD, month: MONTH });
    expect(view.perChild).toEqual([]);
    expect(view.grandTotalMad).toBe(0);
    expect(view.aggregateStatus).toBe('unpaid');
  });

  it('is not paid while any child still has an outstanding balance', async () => {
    const paidChild = makeStudent('Amine Alaoui');
    const owingChild = makeStudent('Zaid Alaoui');
    await students.save(paidChild);
    await students.save(owingChild);
    const invA = makeInvoice(paidChild.id);
    await invoices.createDraft(invA, [makeLine(invA.id, 'regular', 30000)]);
    invoices.setNetPaid(invA.id, 30000);
    const invZ = makeInvoice(owingChild.id);
    await invoices.createDraft(invZ, [makeLine(invZ.id, 'regular', 30000)]);
    invoices.setNetPaid(invZ.id, 0);

    const view = await build().execute({ centerCode: CENTER, parentId: DAD, month: MONTH });

    expect(view.grandTotalMad).toBe(60000);
    expect(view.totalReceivedMad).toBe(30000);
    expect(view.outstandingMad).toBe(30000);
    expect(view.aggregateStatus).toBe('partially-paid');
  });

  it('reads paid once every invoiced child is fully settled', async () => {
    const a = makeStudent('Amine Alaoui');
    const z = makeStudent('Zaid Alaoui');
    await students.save(a);
    await students.save(z);
    const invA = makeInvoice(a.id);
    await invoices.createDraft(invA, [makeLine(invA.id, 'regular', 30000)]);
    invoices.setNetPaid(invA.id, 30000);
    const invZ = makeInvoice(z.id);
    await invoices.createDraft(invZ, [makeLine(invZ.id, 'regular', 20000)]);
    invoices.setNetPaid(invZ.id, 20000);

    const view = await build().execute({ centerCode: CENTER, parentId: DAD, month: MONTH });
    expect(view.aggregateStatus).toBe('paid');
    expect(view.outstandingMad).toBe(0);
  });

  it('excludes a cancelled child invoice from the consolidated money', async () => {
    const active = makeStudent('Amine Alaoui');
    const cancelled = makeStudent('Zaid Alaoui');
    await students.save(active);
    await students.save(cancelled);
    const invActive = makeInvoice(active.id);
    await invoices.createDraft(invActive, [makeLine(invActive.id, 'regular', 30000)]);
    invoices.setNetPaid(invActive.id, 30000);
    const invCancelled = makeInvoice(cancelled.id, 'cancelled');
    await invoices.createDraft(invCancelled, [makeLine(invCancelled.id, 'regular', 99000)]);
    invoices.setNetPaid(invCancelled.id, 0);

    const view = await build().execute({ centerCode: CENTER, parentId: DAD, month: MONTH });

    // The cancelled block is still present (traceable) but adds nothing to the total.
    const cancelledBlock = view.perChild.find((c) => c.childName.fr === 'Zaid Alaoui');
    expect(cancelledBlock?.invoiceStatus).toBe('cancelled');
    expect(view.grandTotalMad).toBe(30000);
    expect(view.outstandingMad).toBe(0);
    expect(view.aggregateStatus).toBe('paid');
  });

  it('never leaks a child from another center (tenant scope)', async () => {
    const local = makeStudent('Amine Alaoui');
    const foreign = makeStudent('Zaid Alaoui', { centerCode: OTHER });
    await students.save(local);
    await students.save(foreign);
    const invLocal = makeInvoice(local.id);
    await invoices.createDraft(invLocal, [makeLine(invLocal.id, 'regular', 10000)]);
    invoices.setNetPaid(invLocal.id, 0);

    const view = await build().execute({ centerCode: CENTER, parentId: DAD, month: MONTH });
    expect(view.perChild.map((c) => c.childName.fr)).toEqual(['Amine Alaoui']);
  });

  describe('resolution / plan gating', () => {
    it('throws ParentNotFoundError for an unknown guardian', async () => {
      await expect(
        build().execute({
          centerCode: CENTER,
          parentId: 'prt_00000000000000000000000099' as ParentId,
          month: MONTH,
        }),
      ).rejects.toBeInstanceOf(ParentNotFoundError);
    });

    it('throws ParentNotFoundError for a foreign-center guardian', async () => {
      await expect(
        build().execute({ centerCode: OTHER, parentId: DAD, month: MONTH }),
      ).rejects.toBeInstanceOf(ParentNotFoundError);
    });

    it('throws PlanFeatureUnavailableError without core.invoicing', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(['core.parents']),
        limits: PLANS.essentiel.limits,
      };
      await expect(
        build(planWithout).execute({ centerCode: CENTER, parentId: DAD, month: MONTH }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });

    it('throws PlanFeatureUnavailableError without core.parents', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(['core.invoicing']),
        limits: PLANS.essentiel.limits,
      };
      await expect(
        build(planWithout).execute({ centerCode: CENTER, parentId: DAD, month: MONTH }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });
});
