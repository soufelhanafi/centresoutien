import { describe, it, expect, beforeEach } from 'vitest';
import { RecordPayment } from '../../../src/use-cases/record-payment';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { InvoiceNotFoundError, InvoiceNotPayableError } from '../../../src/errors/invoice-errors';
import { PaymentExceedsBalanceError } from '../../../src/errors/payment-errors';
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
import { planWithoutFeature } from '../fakes/plans';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const STUDENT = 'stu_00000000000000000000000001' as StudentId;
const INVOICE = 'inv_00000000000000000000000001' as InvoiceId;
const RECORDED_ISO = '2026-08-05T09:00:00Z';

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
function makeLine(invoiceId: InvoiceId, amountMad: number): InvoiceLine {
  lineSeq += 1;
  return {
    id: `invl_${String(lineSeq).padStart(26, '0')}` as InvoiceLineId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, seedClock),
    invoiceId,
    formulaId: 'fml_00000000000000000000000009' as FormulaId,
    label: { fr: 'Math + Physique', ar: 'رياضيات وفيزياء' },
    kind: 'regular',
    amountMad,
  };
}

function baseInput() {
  return {
    invoiceId: INVOICE as string,
    amountMad: 35000,
    method: 'cash',
    paidOn: '2026-08-05',
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
  };
}

describe('RecordPayment', () => {
  let invoices: InMemoryInvoiceRepository;
  let payments: InMemoryPaymentRepository;
  // One generator per test so successive payments in the same test get distinct ids
  // (seeded high to never collide with the fixtures' hard-coded pay_ ids).
  let ids = fakeIds(100);

  function build(plan: Plan): RecordPayment {
    const ledger = new InMemoryPaymentLedgerUnitOfWork(payments);
    return new RecordPayment(payments, invoices, fakeClock(RECORDED_ISO), ids, new PlanPolicy(plan), ledger);
  }

  beforeEach(async () => {
    invoices = new InMemoryInvoiceRepository();
    payments = new InMemoryPaymentRepository();
    ids = fakeIds(100);
    // A 350 MAD invoice (one 35000-centime line).
    await invoices.createDraft(makeInvoice(), [makeLine(INVOICE, 35000)]);
  });

  describe('happy path — full payment ("mark paid")', () => {
    it('appends a payment for the full balance and derives paid', async () => {
      const { payment, status } = await build(PLANS.essentiel).execute(baseInput());

      expect(payment.id).toMatch(/^pay_/);
      expect(payment.kind).toBe('payment');
      expect(payment.amountMad).toBe(35000);
      expect(payment.method).toBe('cash');
      expect(payment.paidOn).toBe('2026-08-05');
      expect(payment.reversesPaymentId).toBeNull();
      expect(payment.createdAt).toEqual(new Date(RECORDED_ISO));
      expect(payment.version).toBe(0); // hub's to assign
      expect(status).toBe('paid');
      expect(await payments.sumForInvoice(INVOICE)).toBe(35000);
      expect(payment.note).toBeNull();
    });

    it('stores a trimmed note when provided', async () => {
      const { payment } = await build(PLANS.essentiel).execute({
        ...baseInput(),
        note: '  chèque n°1234  ',
      });
      expect(payment.note).toBe('chèque n°1234');
    });

    it('collapses a blank note to null', async () => {
      const { payment } = await build(PLANS.essentiel).execute({ ...baseInput(), note: '   ' });
      expect(payment.note).toBeNull();
    });
  });

  describe('overpayment — blocked outright (SOU-101)', () => {
    it('throws PaymentExceedsBalanceError above the outstanding balance and appends nothing', async () => {
      await expect(
        build(PLANS.essentiel).execute({ ...baseInput(), amountMad: 40000 }),
      ).rejects.toBeInstanceOf(PaymentExceedsBalanceError);
      expect(payments.all()).toHaveLength(0);
    });

    it('carries the invoice id, outstanding balance, and attempted amount', async () => {
      await expect(
        build(PLANS.essentiel).execute({ ...baseInput(), amountMad: 40000 }),
      ).rejects.toMatchObject({ invoiceId: INVOICE, outstandingMad: 35000, attemptedAmountMad: 40000 });
    });

    it('blocks even on Pro, where partial payments are otherwise allowed', async () => {
      await expect(
        build(PLANS.pro).execute({ ...baseInput(), amountMad: 40000 }),
      ).rejects.toBeInstanceOf(PaymentExceedsBalanceError);
    });

    it('blocks overpaying the small remainder after a partial payment', async () => {
      await build(PLANS.pro).execute({ ...baseInput(), amountMad: 20000 });
      await expect(
        build(PLANS.pro).execute({ ...baseInput(), amountMad: 15001 }),
      ).rejects.toBeInstanceOf(PaymentExceedsBalanceError);
    });
  });

  describe('partial payment — Pro-gated', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks partial-paid for a below-balance amount and appends nothing', async () => {
      await expect(
        build(planWithoutFeature('core.invoicing.partial-paid')).execute({
          ...baseInput(),
          amountMad: 20000,
        }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(payments.all()).toHaveLength(0);
    });

    it('allows a partial payment on Pro and derives partially-paid', async () => {
      const { status } = await build(PLANS.pro).execute({ ...baseInput(), amountMad: 20000 });
      expect(status).toBe('partially-paid');
      expect(await payments.sumForInvoice(INVOICE)).toBe(20000);
    });

    it('lets a second Pro payment settle the remaining balance to paid', async () => {
      await build(PLANS.pro).execute({ ...baseInput(), amountMad: 20000 });
      const { status } = await build(PLANS.pro).execute({ ...baseInput(), amountMad: 15000 });
      expect(status).toBe('paid');
    });

    it('treats paying the exact remaining balance as a full payment (allowed on Essentiel)', async () => {
      // Pre-existing 20000 partial (seed via Pro), then pay the exact 15000 remainder on Essentiel.
      await build(PLANS.pro).execute({ ...baseInput(), amountMad: 20000 });
      const { status } = await build(PLANS.essentiel).execute({ ...baseInput(), amountMad: 15000 });
      expect(status).toBe('paid');
    });
  });

  describe('resolution / tenant scoping', () => {
    it('throws InvoiceNotFoundError for an unknown invoice', async () => {
      await expect(
        build(PLANS.essentiel).execute({
          ...baseInput(),
          invoiceId: 'inv_00000000000000000000000099',
        }),
      ).rejects.toBeInstanceOf(InvoiceNotFoundError);
    });

    it('throws InvoiceNotFoundError for an invoice in another center (no cross-tenant pay)', async () => {
      await expect(
        build(PLANS.essentiel).execute({ ...baseInput(), centerCode: OTHER_CENTER }),
      ).rejects.toBeInstanceOf(InvoiceNotFoundError);
    });

    it('throws InvoiceNotFoundError for a discarded invoice', async () => {
      await invoices.softDelete(INVOICE, new Date('2026-08-02T00:00:00Z'), USER);
      await expect(build(PLANS.essentiel).execute(baseInput())).rejects.toBeInstanceOf(
        InvoiceNotFoundError,
      );
    });
  });

  describe('payable state (SOU-232)', () => {
    const DRAFT = 'inv_00000000000000000000000002' as InvoiceId;
    const CANCELLED = 'inv_00000000000000000000000003' as InvoiceId;

    it('throws InvoiceNotPayableError for a draft invoice and appends nothing', async () => {
      await invoices.createDraft(makeInvoice({ id: DRAFT, status: 'draft', issuedAt: null }), [
        makeLine(DRAFT, 35000),
      ]);
      await expect(
        build(PLANS.essentiel).execute({ ...baseInput(), invoiceId: DRAFT as string }),
      ).rejects.toBeInstanceOf(InvoiceNotPayableError);
      expect(payments.all()).toHaveLength(0);
    });

    it('throws InvoiceNotPayableError for a cancelled invoice', async () => {
      await invoices.createDraft(
        makeInvoice({ id: CANCELLED, status: 'cancelled', cancelledAt: new Date('2026-08-02T00:00:00Z') }),
        [makeLine(CANCELLED, 35000)],
      );
      await expect(
        build(PLANS.essentiel).execute({ ...baseInput(), invoiceId: CANCELLED as string }),
      ).rejects.toBeInstanceOf(InvoiceNotPayableError);
    });

    it('carries the invoice id and offending status', async () => {
      await invoices.createDraft(makeInvoice({ id: DRAFT, status: 'draft', issuedAt: null }), [
        makeLine(DRAFT, 35000),
      ]);
      await expect(
        build(PLANS.essentiel).execute({ ...baseInput(), invoiceId: DRAFT as string }),
      ).rejects.toMatchObject({ invoiceId: DRAFT, status: 'draft' });
    });
  });

  describe('zero outstanding — fully paid already', () => {
    it('rejects any further payment on a settled invoice (outstanding 0)', async () => {
      await build(PLANS.essentiel).execute(baseInput()); // pays the full 35000
      await expect(
        build(PLANS.essentiel).execute({ ...baseInput(), amountMad: 1 }),
      ).rejects.toBeInstanceOf(PaymentExceedsBalanceError);
      expect(await payments.sumForInvoice(INVOICE)).toBe(35000);
    });
  });

  describe('concurrency — atomic balance guard (SOU-233)', () => {
    it('lets exactly one of two racing full payments succeed', async () => {
      const results = await Promise.allSettled([
        build(PLANS.essentiel).execute(baseInput()),
        build(PLANS.essentiel).execute(baseInput()),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        PaymentExceedsBalanceError,
      );
      // The ledger never overshoots the balance: one 35000 payment, net exactly 35000.
      expect(payments.all().filter((p) => p.kind === 'payment')).toHaveLength(1);
      expect(await payments.sumForInvoice(INVOICE)).toBe(35000);
    });
  });

  describe('validation', () => {
    it('rejects a non-positive amount', async () => {
      await expect(build(PLANS.essentiel).execute({ ...baseInput(), amountMad: 0 })).rejects.toThrow();
    });

    it('rejects a non-integer amount', async () => {
      await expect(
        build(PLANS.essentiel).execute({ ...baseInput(), amountMad: 100.5 }),
      ).rejects.toThrow();
    });

    it('rejects an invalid method', async () => {
      await expect(
        build(PLANS.essentiel).execute({ ...baseInput(), method: 'bitcoin' }),
      ).rejects.toThrow();
    });

    it('rejects an impossible paidOn date', async () => {
      await expect(
        build(PLANS.essentiel).execute({ ...baseInput(), paidOn: '2026-02-30' }),
      ).rejects.toThrow();
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.invoicing', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(build(planWithout).execute(baseInput())).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
      expect(payments.all()).toHaveLength(0);
    });
  });
});
