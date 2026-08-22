import { describe, it, expect, beforeEach } from 'vitest';
import { SetInvoiceSubjectAllocation } from '../../../src/use-cases/set-invoice-subject-allocation';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { InvalidInvoiceAllocationError, InvoiceNotFoundError } from '../../../src/errors/invoice-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Invoice, InvoiceId } from '../../../src/entities/invoice';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { StudentId } from '../../../src/entities/student';
import type { SubjectId } from '../../../src/entities/subject';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { fakeClock } from '../fakes/clock';
import { planWithoutFeature } from '../fakes/plans';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const EDITOR = 'usr_00000000000000000000000002' as UserId;
const STUDENT = 'stu_00000000000000000000000001' as StudentId;
const INVOICE_ID = 'inv_00000000000000000000000001' as InvoiceId;
const MATH = 'sub_00000000000000000000000001' as SubjectId;
const FR = 'sub_00000000000000000000000002' as SubjectId;

const SEED_ISO = '2026-08-01T00:00:00Z';
const SET_ISO = '2026-08-10T09:00:00Z';

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: INVOICE_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock(SEED_ISO)),
    studentId: STUDENT,
    month: '2026-08',
    status: 'issued',
    issuedAt: new Date(SEED_ISO),
    cancelledAt: null,
    subjectAllocation: null,
    ...overrides,
  };
}

describe('SetInvoiceSubjectAllocation', () => {
  let invoices: InMemoryInvoiceRepository;

  function build(plan: Plan): SetInvoiceSubjectAllocation {
    return new SetInvoiceSubjectAllocation(invoices, fakeClock(SET_ISO), new PlanPolicy(plan));
  }

  beforeEach(() => {
    invoices = new InMemoryInvoiceRepository();
  });

  it('pins a manual per-subject allocation on the invoice', async () => {
    await invoices.save(makeInvoice());

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
    await invoices.save(makeInvoice({ subjectAllocation: [{ subjectId: MATH, amountMad: 90000 }] }));

    const updated = await build(PLANS.premium).execute({
      centerCode: CENTER,
      invoiceId: INVOICE_ID,
      allocations: null,
      updatedBy: EDITOR,
    });

    expect(updated.subjectAllocation).toBeNull();
  });

  it('rejects a duplicated subject', async () => {
    await invoices.save(makeInvoice());

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
    await invoices.save(makeInvoice());

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
    await invoices.save(makeInvoice({ centerCode: OTHER_CENTER }));

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
    await invoices.save(makeInvoice());

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
