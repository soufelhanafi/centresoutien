import { describe, it, expect, beforeEach } from 'vitest';
import { RecordPayment } from '../../../src/use-cases/record-payment';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { InvoiceNotFoundError } from '../../../src/errors/invoice-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Invoice, InvoiceId } from '../../../src/entities/invoice';
import type { InvoiceLine, InvoiceLineId } from '../../../src/entities/invoice-line';
import type { StudentId } from '../../../src/entities/student';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { InMemoryPaymentRepository } from '../fakes/in-memory-payment-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

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
    formulaId: 'for_00000000000000000000000009',
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
    return new RecordPayment(payments, invoices, fakeClock(RECORDED_ISO), ids, new PlanPolicy(plan));
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
    });

    it('accepts overpayment on any plan and clamps status to paid', async () => {
      const { status } = await build(PLANS.essentiel).execute({ ...baseInput(), amountMad: 40000 });
      expect(status).toBe('paid');
      expect(await payments.sumForInvoice(INVOICE)).toBe(40000);
    });
  });

  describe('partial payment — Pro-gated', () => {
    it('throws PlanFeatureUnavailableError on Essentiel for a below-balance amount and appends nothing', async () => {
      await expect(
        build(PLANS.essentiel).execute({ ...baseInput(), amountMad: 20000 }),
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
