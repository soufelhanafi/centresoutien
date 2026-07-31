import { describe, it, expect, beforeEach } from 'vitest';
import { VoidPayment } from '../../../src/use-cases/void-payment';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import {
  PaymentNotFoundError,
  CannotReverseReversalError,
  PaymentAlreadyReversedError,
} from '../../../src/errors/payment-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Payment, PaymentId, PaymentKind } from '../../../src/entities/payment';
import type { InvoiceId } from '../../../src/entities/invoice';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryPaymentRepository } from '../fakes/in-memory-payment-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const EDITOR = 'usr_00000000000000000000000002' as UserId;
const INVOICE = 'inv_00000000000000000000000001' as InvoiceId;
const PAYMENT = 'pay_00000000000000000000000001' as PaymentId;
const VOID_ISO = '2026-08-10T14:30:00Z';

const seedClock = fakeClock('2026-08-05T09:00:00Z');

function makePayment(over: Partial<Payment> & { kind?: PaymentKind } = {}): Payment {
  return {
    id: PAYMENT,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, seedClock),
    invoiceId: INVOICE,
    kind: 'payment',
    amountMad: 20000,
    method: 'cheque',
    paidOn: '2026-08-05',
    reversesPaymentId: null,
    ...over,
  };
}

describe('VoidPayment', () => {
  let payments: InMemoryPaymentRepository;
  // Seeded high so a generated reversal id never collides with the pay_…01 fixture.
  let ids = fakeIds(100);

  function build(plan: Plan): VoidPayment {
    return new VoidPayment(payments, fakeClock(VOID_ISO), ids, new PlanPolicy(plan));
  }

  beforeEach(() => {
    payments = new InMemoryPaymentRepository();
    ids = fakeIds(100);
  });

  describe('happy path', () => {
    beforeEach(async () => {
      await payments.append(makePayment());
    });

    it('appends a reversal that mirrors the original amount/method and points back at it', async () => {
      const reversal = await build(PLANS.essentiel).execute({
        paymentId: PAYMENT,
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        updatedBy: EDITOR,
      });

      expect(reversal.id).toMatch(/^pay_/);
      expect(reversal.id).not.toBe(PAYMENT);
      expect(reversal.kind).toBe('reversal');
      expect(reversal.amountMad).toBe(20000);
      expect(reversal.method).toBe('cheque');
      expect(reversal.invoiceId).toBe(INVOICE);
      expect(reversal.reversesPaymentId).toBe(PAYMENT);
      // paidOn is the reversal date (today, UTC), not the original's business date.
      expect(reversal.paidOn).toBe('2026-08-10');
      expect(reversal.updatedBy).toBe(EDITOR);
    });

    it('drives the net to zero without deleting the original (both rows survive)', async () => {
      await build(PLANS.essentiel).execute({
        paymentId: PAYMENT,
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        updatedBy: EDITOR,
      });
      expect(await payments.sumForInvoice(INVOICE)).toBe(0);
      expect(payments.all()).toHaveLength(2);
      // The original is untouched (append-only), still findable.
      expect((await payments.findById(PAYMENT))?.kind).toBe('payment');
    });
  });

  describe('guards', () => {
    it('throws PaymentNotFoundError for an unknown payment', async () => {
      await expect(
        build(PLANS.essentiel).execute({
          paymentId: 'pay_00000000000000000000000099',
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: EDITOR,
        }),
      ).rejects.toBeInstanceOf(PaymentNotFoundError);
    });

    it('throws PaymentNotFoundError for a payment in another center', async () => {
      await payments.append(makePayment({ centerCode: OTHER_CENTER }));
      await expect(
        build(PLANS.essentiel).execute({
          paymentId: PAYMENT,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: EDITOR,
        }),
      ).rejects.toBeInstanceOf(PaymentNotFoundError);
    });

    it('throws CannotReverseReversalError when the target is itself a reversal', async () => {
      await payments.append(
        makePayment({
          kind: 'reversal',
          reversesPaymentId: 'pay_00000000000000000000000050' as PaymentId,
        }),
      );
      await expect(
        build(PLANS.essentiel).execute({
          paymentId: PAYMENT,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: EDITOR,
        }),
      ).rejects.toBeInstanceOf(CannotReverseReversalError);
    });

    it('throws PaymentAlreadyReversedError on a double void and appends nothing new', async () => {
      await payments.append(makePayment());
      await build(PLANS.essentiel).execute({
        paymentId: PAYMENT,
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        updatedBy: EDITOR,
      });
      await expect(
        build(PLANS.essentiel).execute({
          paymentId: PAYMENT,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: EDITOR,
        }),
      ).rejects.toBeInstanceOf(PaymentAlreadyReversedError);
      expect(payments.all()).toHaveLength(2); // original + the one reversal
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.invoicing', async () => {
      await payments.append(makePayment());
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(
        build(planWithout).execute({
          paymentId: PAYMENT,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: EDITOR,
        }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(payments.all()).toHaveLength(1); // nothing appended
    });
  });
});
