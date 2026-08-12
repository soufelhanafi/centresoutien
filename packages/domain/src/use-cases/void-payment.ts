import type { PaymentReader } from '../ports/payment-repository';
import type { PaymentLedgerUnitOfWork } from '../ports/payment-ledger-unit-of-work';
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
 *     net negative) → {@link PaymentAlreadyReversedError}. This is a fast pre-check; the
 *     authoritative guard runs INSIDE the commit transaction (`reversalOf`), which
 *     re-checks that no live reversal of this payment exists before appending, so two
 *     concurrent voids of the same payment cannot both append (SOU-233 / audit
 *     CS-AUD-002). The DB partial-unique index is a defense-in-depth backstop.
 *
 * The reversal's `paidOn` is *today* (the reversal date, from the injected Clock, UTC),
 * not the original's business date — it is a distinct ledger event. Append-only and
 * ULID-keyed, so it unions cleanly at sync like any other payment.
 */
export class VoidPayment {
  constructor(
    private readonly payments: PaymentReader,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
    private readonly ledger: PaymentLedgerUnitOfWork,
  ) {}

  async execute(input: VoidPaymentInput): Promise<Payment> {
    // Deliberately gated on `core.invoicing` only, NOT `core.invoicing.partial-paid`:
    // a correction must never be plan-locked. This means voiding one of several payments
    // can legitimately leave an Essentiel invoice `partially-paid` — a state RecordPayment
    // gates behind Pro. That asymmetry is intentional; do not "fix" it by adding the
    // partial-paid gate here.
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
      note: null, // voiding takes no note input (SOU-101 scope is RecordPayment only)
    };

    await this.ledger.commit({
      candidate: reversal,
      // A reversal never depends on the running balance — its guard is "voided at most
      // once", enforced in-transaction via reversalOf (the DB partial-unique index is a
      // defense-in-depth backstop mapped to the same error), not a net threshold.
      revalidate: () => {},
      reversalOf: {
        paymentId: originalId,
        onAlreadyReversed: () => new PaymentAlreadyReversedError(originalId),
      },
    });
    return reversal;
  }
}
