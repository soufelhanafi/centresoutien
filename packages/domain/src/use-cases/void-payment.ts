import type { PaymentRepository } from '../ports/payment-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import { newEnvelope } from '../entities/envelope';
import { PAYMENT_ID_PREFIX, type Payment, type PaymentId } from '../entities/payment';
import { voidPaymentSchema } from '../schemas/payment';
import {
  PaymentNotFoundError,
  CannotReverseReversalError,
  PaymentAlreadyReversedError,
} from '../errors/payment-errors';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';

export type VoidPaymentInput = {
  paymentId: string;
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/**
 * Voids a payment by **appending a `reversal`** that references it (SOU-93) — never a
 * DELETE or an UPDATE. This is how the duplicates tab (SOU-91) resolves a probable
 * double-entry: void one of the two rows. The reversal carries the original's amount
 * and method, so the derived net drops by exactly that payment.
 *
 * Guards, in order:
 *  1. Gate on `core.invoicing`.
 *  2. Resolve the target center-scoped; unknown or foreign-center → {@link PaymentNotFoundError}.
 *  3. A `reversal` cannot itself be reversed → {@link CannotReverseReversalError}.
 *  4. A payment already carrying a reversal cannot be voided twice (that would push the
 *     net negative) → {@link PaymentAlreadyReversedError}.
 *
 * The reversal's `paidOn` is *today* (the reversal date, from the injected Clock, UTC),
 * not the original's business date — it is a distinct ledger event. Append-only and
 * ULID-keyed, so it unions cleanly at sync like any other payment.
 */
export class VoidPayment {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: VoidPaymentInput): Promise<Payment> {
    this.plan.require('core.invoicing');
    const fields = voidPaymentSchema.parse(input);

    const originalId = fields.paymentId as PaymentId;
    const original = await this.payments.findById(originalId);
    if (original === null || original.centerCode !== input.centerCode) {
      throw new PaymentNotFoundError(originalId);
    }
    if (original.kind === 'reversal') {
      throw new CannotReverseReversalError(originalId);
    }

    const ledger = await this.payments.listForInvoice(original.invoiceId);
    const alreadyReversed = ledger.some(
      (entry) => entry.kind === 'reversal' && entry.reversesPaymentId === originalId,
    );
    if (alreadyReversed) {
      throw new PaymentAlreadyReversedError(originalId);
    }

    const now = this.clock.now();
    const reversal: Payment = {
      id: this.ids.next(PAYMENT_ID_PREFIX) as PaymentId,
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      invoiceId: original.invoiceId,
      kind: 'reversal',
      amountMad: original.amountMad,
      method: original.method,
      paidOn: now.toISOString().slice(0, 10), // reversal date, UTC 'YYYY-MM-DD'
      reversesPaymentId: originalId,
    };

    await this.payments.append(reversal);
    return reversal;
  }
}
