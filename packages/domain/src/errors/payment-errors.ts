import { DomainError } from './plan-errors';
import type { PaymentId } from '../entities/payment';
import type { InvoiceId } from '../entities/invoice';

/**
 * Thrown when a void targets a payment id with no live row — unknown or belonging to
 * another center. The renderer resolves the stable `payment-not-found` code; the domain
 * stays i18n-agnostic.
 */
export class PaymentNotFoundError extends DomainError {
  readonly code = 'payment-not-found';

  constructor(readonly id: PaymentId) {
    super(`No payment with id "${id}".`);
  }
}

/**
 * Thrown when a void targets a `reversal` row. A reversal already voids a payment;
 * reversing it would be a re-payment in disguise — record a fresh `payment` instead.
 * The renderer resolves the stable `cannot-reverse-reversal` code.
 */
export class CannotReverseReversalError extends DomainError {
  readonly code = 'cannot-reverse-reversal';

  constructor(readonly id: PaymentId) {
    super(`Payment "${id}" is a reversal and cannot itself be reversed.`);
  }
}

/**
 * Thrown when a payment already has a reversal — voiding it twice would double-count
 * the correction and push the net negative. The renderer resolves the stable
 * `payment-already-reversed` code.
 */
export class PaymentAlreadyReversedError extends DomainError {
  readonly code = 'payment-already-reversed';

  constructor(readonly id: PaymentId) {
    super(`Payment "${id}" has already been reversed.`);
  }
}

/**
 * Thrown when `RecordPayment` is asked to append more than the outstanding balance
 * (SOU-101 KICKOFF: overpayment is blocked outright, not clamped — there is no
 * credit-note entity). The renderer resolves the stable `payment-exceeds-balance`
 * code and surfaces the outstanding amount so the cash desk can correct the entry.
 */
export class PaymentExceedsBalanceError extends DomainError {
  readonly code = 'payment-exceeds-balance';

  constructor(
    readonly invoiceId: InvoiceId,
    readonly outstandingMad: number,
    readonly attemptedAmountMad: number,
  ) {
    super(
      `Payment of ${attemptedAmountMad} exceeds the outstanding balance of ${outstandingMad} for invoice "${invoiceId}".`,
    );
  }
}
