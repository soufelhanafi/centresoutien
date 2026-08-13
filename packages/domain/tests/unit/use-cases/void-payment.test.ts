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
import { InMemoryPaymentLedgerUnitOfWork } from '../fakes/in-memory-payment-ledger-unit-of-work';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const EDITOR = 'usr_00000000000000000000000002' as UserId;
const INVOICE = 'inv_00000000000000000000000001' as InvoiceId;
const PAYMENT = 'pay_00000000000000000000000001' as PaymentId;
// The clock sits just past UTC midnight on the 10th; the local business day passed in
// is still the 9th (SOU-244) — deliberately different so a reversal that read the clock
// instead of the input would stamp the wrong day and fail the assertions below.
const VOID_ISO = '2026-08-10T00:30:00Z';
const LOCAL_BUSINESS_DAY = '2026-08-09';

const seedClock = fakeClock('2026-08-05T09:00:00Z');

function voidInput(over: Partial<VoidArgs> = {}): VoidArgs {
  return {
    paymentId: PAYMENT,
    paidOn: LOCAL_BUSINESS_DAY,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: EDITOR,
    ...over,
  };
}

type VoidArgs = {
  paymentId: string;
  paidOn: string;
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

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
    const ledger = new InMemoryPaymentLedgerUnitOfWork(payments);
    return new VoidPayment(payments, fakeClock(VOID_ISO), ids, new PlanPolicy(plan), ledger);
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
      const reversal = await build(PLANS.essentiel).execute(voidInput());

      expect(reversal.id).toMatch(/^pay_/);
      expect(reversal.id).not.toBe(PAYMENT);
      expect(reversal.kind).toBe('reversal');
      expect(reversal.amountMad).toBe(20000);
      expect(reversal.method).toBe('cheque');
      expect(reversal.invoiceId).toBe(INVOICE);
      expect(reversal.reversesPaymentId).toBe(PAYMENT);
      expect(reversal.updatedBy).toBe(EDITOR);
    });

    it('stamps paidOn with the local business day from the caller, not the UTC clock day (SOU-244)', async () => {
      const reversal = await build(PLANS.essentiel).execute(voidInput());
      // The clock is on the 10th UTC; the reversal must carry the caller's local day (9th),
      // so it nets against the same business day the cash-desk header shows.
      expect(reversal.paidOn).toBe(LOCAL_BUSINESS_DAY);
      expect(reversal.paidOn).not.toBe('2026-08-10');
    });

    it('drives the net to zero without deleting the original (both rows survive)', async () => {
      await build(PLANS.essentiel).execute(voidInput());
      expect(await payments.sumForInvoice(INVOICE)).toBe(0);
      expect(payments.all()).toHaveLength(2);
      // The original is untouched (append-only), still findable.
      expect((await payments.findById(PAYMENT))?.kind).toBe('payment');
    });
  });

  describe('guards', () => {
    it('throws PaymentNotFoundError for an unknown payment', async () => {
      await expect(
        build(PLANS.essentiel).execute(voidInput({ paymentId: 'pay_00000000000000000000000099' })),
      ).rejects.toBeInstanceOf(PaymentNotFoundError);
    });

    it('throws PaymentNotFoundError for a payment in another center', async () => {
      await payments.append(makePayment({ centerCode: OTHER_CENTER }));
      await expect(build(PLANS.essentiel).execute(voidInput())).rejects.toBeInstanceOf(
        PaymentNotFoundError,
      );
    });

    it('throws CannotReverseReversalError when the target is itself a reversal', async () => {
      await payments.append(
        makePayment({
          kind: 'reversal',
          reversesPaymentId: 'pay_00000000000000000000000050' as PaymentId,
        }),
      );
      await expect(build(PLANS.essentiel).execute(voidInput())).rejects.toBeInstanceOf(
        CannotReverseReversalError,
      );
    });

    it('throws PaymentAlreadyReversedError on a double void and appends nothing new', async () => {
      await payments.append(makePayment());
      await build(PLANS.essentiel).execute(voidInput());
      await expect(build(PLANS.essentiel).execute(voidInput())).rejects.toBeInstanceOf(
        PaymentAlreadyReversedError,
      );
      expect(payments.all()).toHaveLength(2); // original + the one reversal
    });
  });

  describe('concurrency — atomic reversal guard (SOU-233)', () => {
    it('lets exactly one of two racing voids of the same payment succeed', async () => {
      await payments.append(makePayment());

      const results = await Promise.allSettled([
        build(PLANS.essentiel).execute(voidInput()),
        build(PLANS.essentiel).execute(voidInput()),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        PaymentAlreadyReversedError,
      );
      // Exactly one reversal appended; net is 0 (original 20000 minus one reversal), never negative.
      expect(payments.all().filter((p) => p.kind === 'reversal')).toHaveLength(1);
      expect(await payments.sumForInvoice(INVOICE)).toBe(0);
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
      await expect(build(planWithout).execute(voidInput())).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
      expect(payments.all()).toHaveLength(1); // nothing appended
    });
  });
});
