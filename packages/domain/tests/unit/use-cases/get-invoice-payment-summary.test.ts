import { describe, it, expect, beforeEach } from 'vitest';
import { GetInvoicePaymentSummary } from '../../../src/use-cases/get-invoice-payment-summary';
import { RecordPayment } from '../../../src/use-cases/record-payment';
import { VoidPayment } from '../../../src/use-cases/void-payment';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { InvoiceNotFoundError } from '../../../src/errors/invoice-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Invoice, InvoiceId } from '../../../src/entities/invoice';
import type { InvoiceLine, InvoiceLineId } from '../../../src/entities/invoice-line';
import type { FormulaId } from '../../../src/entities/formula';
import type { StudentId } from '../../../src/entities/student';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { InMemoryPaymentRepository } from '../fakes/in-memory-payment-repository';
import { InMemoryPaymentLedgerUnitOfWork } from '../fakes/in-memory-payment-ledger-unit-of-work';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import type { Payment, PaymentId } from '../../../src/entities/payment';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const STUDENT = 'stu_00000000000000000000000001' as StudentId;
const INVOICE = 'inv_00000000000000000000000001' as InvoiceId;

const seedClock = fakeClock('2026-08-01T10:00:00Z');

function makeInvoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: INVOICE,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, seedClock),
    studentId: STUDENT,
    month: '2026-09',
    status: 'issued',
    issuedAt: new Date('2026-08-01T10:00:00Z'),
    cancelledAt: null,
    ...over,
  };
}

let lineSeq = 0;
function makeLine(amountMad: number): InvoiceLine {
  lineSeq += 1;
  return {
    id: `invl_${String(lineSeq).padStart(26, '0')}` as InvoiceLineId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, seedClock),
    invoiceId: INVOICE,
    formulaId: 'fml_00000000000000000000000009' as FormulaId,
    label: { fr: 'Math', ar: 'رياضيات' },
    kind: 'regular',
    amountMad,
  };
}

describe('GetInvoicePaymentSummary', () => {
  let invoices: InMemoryInvoiceRepository;
  let payments: InMemoryPaymentRepository;

  function build(plan: Plan = PLANS.essentiel): GetInvoicePaymentSummary {
    return new GetInvoicePaymentSummary(payments, invoices, new PlanPolicy(plan));
  }

  // Record via the real use case so the summary reads whatever the ledger holds.
  function recorder(plan: Plan = PLANS.pro): RecordPayment {
    const ledger = new InMemoryPaymentLedgerUnitOfWork(payments, invoices);
    return new RecordPayment(payments, invoices, fakeClock('2026-08-05T09:00:00Z'), fakeIds(), new PlanPolicy(plan), ledger);
  }

  beforeEach(async () => {
    invoices = new InMemoryInvoiceRepository();
    payments = new InMemoryPaymentRepository();
    await invoices.createDraft(makeInvoice(), [makeLine(20000), makeLine(15000)]); // total 35000
  });

  it('is unpaid with the full total outstanding before any payment', async () => {
    const summary = await build().execute({ centerCode: CENTER, invoiceId: INVOICE });
    expect(summary.totalMad).toBe(35000);
    expect(summary.netPaidMad).toBe(0);
    expect(summary.outstandingMad).toBe(35000);
    expect(summary.status).toBe('unpaid');
    expect(summary.payments).toHaveLength(0);
  });

  it('reflects a partial payment: net, outstanding, status, and the ledger', async () => {
    await recorder().execute(paymentInput(20000));
    const summary = await build().execute({ centerCode: CENTER, invoiceId: INVOICE });
    expect(summary.netPaidMad).toBe(20000);
    expect(summary.outstandingMad).toBe(15000);
    expect(summary.status).toBe('partially-paid');
    expect(summary.payments).toHaveLength(1);
    expect(summary.payments[0]?.kind).toBe('payment');
  });

  it('reads paid with zero outstanding once fully settled', async () => {
    await recorder().execute(paymentInput(35000));
    const summary = await build().execute({ centerCode: CENTER, invoiceId: INVOICE });
    expect(summary.status).toBe('paid');
    expect(summary.outstandingMad).toBe(0);
  });

  it('clamps outstanding to 0 for a ledger that somehow overpaid (never negative)', async () => {
    // RecordPayment blocks overpayment outright (SOU-101), so an overpaid ledger can
    // only arise from data that predates that guard (or a sync-arrived row from
    // another device). The summary's derivation must still stay defensive about it —
    // append the overpaying row directly to the fake, bypassing the use case.
    const overpaying: Payment = {
      id: 'pay_00000000000000000000000099' as PaymentId,
      ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, seedClock),
      invoiceId: INVOICE,
      kind: 'payment',
      amountMad: 50000,
      method: 'cash',
      paidOn: '2026-08-05',
      reversesPaymentId: null,
      note: null,
    };
    await payments.append(overpaying);

    const summary = await build().execute({ centerCode: CENTER, invoiceId: INVOICE });
    expect(summary.status).toBe('paid');
    expect(summary.netPaidMad).toBe(50000);
    expect(summary.outstandingMad).toBe(0);
  });

  it('shows a reversal in the ledger and re-opens the balance', async () => {
    const { payment } = await recorder().execute(paymentInput(35000));
    const voider = new VoidPayment(
      payments,
      fakeClock('2026-08-10T00:00:00Z'),
      fakeIds(7),
      new PlanPolicy(PLANS.pro),
      new InMemoryPaymentLedgerUnitOfWork(payments),
    );
    await voider.execute({
      paymentId: payment.id,
      paidOn: '2026-08-10',
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      updatedBy: USER,
    });

    const summary = await build().execute({ centerCode: CENTER, invoiceId: INVOICE });
    expect(summary.netPaidMad).toBe(0);
    expect(summary.outstandingMad).toBe(35000);
    expect(summary.status).toBe('unpaid');
    expect(summary.payments).toHaveLength(2); // payment + reversal, both retained
  });

  describe('resolution / plan gating', () => {
    it('throws InvoiceNotFoundError for another center', async () => {
      await expect(
        build().execute({ centerCode: OTHER_CENTER, invoiceId: INVOICE }),
      ).rejects.toBeInstanceOf(InvoiceNotFoundError);
    });

    it('throws PlanFeatureUnavailableError without core.invoicing', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(
        build(planWithout).execute({ centerCode: CENTER, invoiceId: INVOICE }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });
});

function paymentInput(amountMad: number) {
  return {
    invoiceId: INVOICE as string,
    amountMad,
    method: 'cash',
    paidOn: '2026-08-05',
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
  };
}
