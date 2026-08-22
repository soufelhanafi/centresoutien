import { describe, it, expect, beforeEach } from 'vitest';
import { SetInvoiceSubjectAllocation } from '../../../src/use-cases/set-invoice-subject-allocation';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { InvalidInvoiceAllocationError, InvoiceNotFoundError } from '../../../src/errors/invoice-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Invoice, InvoiceId } from '../../../src/entities/invoice';
import type { InvoiceLine, InvoiceLineId } from '../../../src/entities/invoice-line';
import type { Formula, FormulaId } from '../../../src/entities/formula';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { StudentId } from '../../../src/entities/student';
import type { SubjectId } from '../../../src/entities/subject';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { InMemoryFormulaRepository } from '../fakes/in-memory-formula-repository';
import { fakeClock } from '../fakes/clock';
import { planWithoutFeature } from '../fakes/plans';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const EDITOR = 'usr_00000000000000000000000002' as UserId;
const STUDENT = 'stu_00000000000000000000000001' as StudentId;
const INVOICE_ID = 'inv_00000000000000000000000001' as InvoiceId;
const LINE_ID = 'invl_0000000000000000000000001' as InvoiceLineId;
const FORMULA_ID = 'fml_00000000000000000000000001' as FormulaId;
const MATH = 'sub_00000000000000000000000001' as SubjectId;
const FR = 'sub_00000000000000000000000002' as SubjectId;
const PHYSICS = 'sub_00000000000000000000000003' as SubjectId;

const SEED_ISO = '2026-08-01T00:00:00Z';
const SET_ISO = '2026-08-10T09:00:00Z';

function envelope() {
  return newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock(SEED_ISO));
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: INVOICE_ID,
    ...envelope(),
    studentId: STUDENT,
    month: '2026-08',
    status: 'issued',
    issuedAt: new Date(SEED_ISO),
    cancelledAt: null,
    subjectAllocation: null,
    ...overrides,
  };
}

// The invoice's line references a Math + Français formula, so those two subjects are
// the ones a manual allocation is allowed to name (SOU-298 unknown-subject guard).
function makeLine(): InvoiceLine {
  return {
    id: LINE_ID,
    ...envelope(),
    invoiceId: INVOICE_ID,
    formulaId: FORMULA_ID,
    label: { fr: 'Math + Français', ar: '' },
    kind: 'regular',
    amountMad: 90000,
  };
}

function makeFormula(): Formula {
  return {
    id: FORMULA_ID,
    ...envelope(),
    name: { fr: 'Math + Français', ar: '' },
    subjectIds: [MATH, FR],
    priceMad: 90000,
    kind: 'regular',
    isImmutable: false,
    active: true,
  };
}

describe('SetInvoiceSubjectAllocation', () => {
  let invoices: InMemoryInvoiceRepository;
  let formulas: InMemoryFormulaRepository;

  function build(plan: Plan): SetInvoiceSubjectAllocation {
    return new SetInvoiceSubjectAllocation(invoices, formulas, fakeClock(SET_ISO), new PlanPolicy(plan));
  }

  async function seedCoveredInvoice(overrides: Partial<Invoice> = {}): Promise<void> {
    await invoices.createDraft(makeInvoice(overrides), [makeLine()]);
    await formulas.save(makeFormula());
  }

  beforeEach(() => {
    invoices = new InMemoryInvoiceRepository();
    formulas = new InMemoryFormulaRepository();
  });

  it('pins a manual per-subject allocation on the invoice', async () => {
    await seedCoveredInvoice();

    const updated = await build(PLANS.premium).execute({
      centerCode: CENTER,
      invoiceId: INVOICE_ID,
      allocations: [
        { subjectId: MATH, amountMad: 44000 },
        { subjectId: FR, amountMad: 46000 },
      ],
      updatedBy: EDITOR,
    });

    expect(updated.subjectAllocation).toEqual([
      { subjectId: MATH, amountMad: 44000 },
      { subjectId: FR, amountMad: 46000 },
    ]);
    expect(updated.updatedAt).toEqual(new Date(SET_ISO));
    expect(updated.updatedBy).toBe(EDITOR);
  });

  it('clears an existing allocation back to the weighted default with null', async () => {
    await seedCoveredInvoice({ subjectAllocation: [{ subjectId: MATH, amountMad: 90000 }] });

    const updated = await build(PLANS.premium).execute({
      centerCode: CENTER,
      invoiceId: INVOICE_ID,
      allocations: null,
      updatedBy: EDITOR,
    });

    expect(updated.subjectAllocation).toBeNull();
  });

  it('rejects a duplicated subject', async () => {
    await seedCoveredInvoice();

    await expect(
      build(PLANS.premium).execute({
        centerCode: CENTER,
        invoiceId: INVOICE_ID,
        allocations: [
          { subjectId: MATH, amountMad: 44000 },
          { subjectId: MATH, amountMad: 46000 },
        ],
        updatedBy: EDITOR,
      }),
    ).rejects.toBeInstanceOf(InvalidInvoiceAllocationError);
  });

  it('rejects an all-zero allocation', async () => {
    await seedCoveredInvoice();

    await expect(
      build(PLANS.premium).execute({
        centerCode: CENTER,
        invoiceId: INVOICE_ID,
        allocations: [
          { subjectId: MATH, amountMad: 0 },
          { subjectId: FR, amountMad: 0 },
        ],
        updatedBy: EDITOR,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'invoice-allocation-all-zero' }));
  });

  it('rejects a subject covered by none of the invoice line formulas', async () => {
    await seedCoveredInvoice();

    await expect(
      build(PLANS.premium).execute({
        centerCode: CENTER,
        invoiceId: INVOICE_ID,
        allocations: [
          { subjectId: MATH, amountMad: 10000 },
          { subjectId: PHYSICS, amountMad: 80000 },
        ],
        updatedBy: EDITOR,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'invoice-allocation-unknown-subject' }));
  });

  it('throws InvoiceNotFoundError for an unknown invoice', async () => {
    await expect(
      build(PLANS.premium).execute({
        centerCode: CENTER,
        invoiceId: INVOICE_ID,
        allocations: [{ subjectId: MATH, amountMad: 90000 }],
        updatedBy: EDITOR,
      }),
    ).rejects.toBeInstanceOf(InvoiceNotFoundError);
  });

  it('throws InvoiceNotFoundError for an invoice in another center', async () => {
    await seedCoveredInvoice({ centerCode: OTHER_CENTER });

    await expect(
      build(PLANS.premium).execute({
        centerCode: CENTER,
        invoiceId: INVOICE_ID,
        allocations: [{ subjectId: MATH, amountMad: 90000 }],
        updatedBy: EDITOR,
      }),
    ).rejects.toBeInstanceOf(InvoiceNotFoundError);
  });

  it('is gated by payroll.teacher', async () => {
    await seedCoveredInvoice();

    await expect(
      build(planWithoutFeature('payroll.teacher')).execute({
        centerCode: CENTER,
        invoiceId: INVOICE_ID,
        allocations: [{ subjectId: MATH, amountMad: 90000 }],
        updatedBy: EDITOR,
      }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });
});
