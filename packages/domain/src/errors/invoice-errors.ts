import { DomainError } from './plan-errors';
import type { InvoiceId, InvoiceStatus } from '../entities/invoice';
import type { StudentId } from '../entities/student';

/**
 * Thrown when a lifecycle transition is not allowed by the invoice state machine
 * (`draft → issued → cancelled`) — e.g. issuing an already-issued invoice, cancelling
 * a cancelled one, or any attempt to move backwards out of a terminal state. The
 * renderer resolves the stable `invalid-invoice-transition` code; the domain stays
 * i18n-agnostic.
 */
export class InvalidInvoiceTransitionError extends DomainError {
  readonly code = 'invalid-invoice-transition';

  constructor(
    readonly invoiceId: InvoiceId,
    readonly from: InvoiceStatus,
    readonly to: InvoiceStatus,
  ) {
    super(`Invoice "${invoiceId}" cannot transition from "${from}" to "${to}".`);
  }
}

/**
 * Thrown when an invoice operation targets an id with no live row — unknown, already
 * discarded (tombstoned), or belonging to another center. The renderer resolves the
 * stable `invoice-not-found` code; the domain stays i18n-agnostic.
 */
export class InvoiceNotFoundError extends DomainError {
  readonly code = 'invoice-not-found';

  constructor(readonly id: InvoiceId) {
    super(`No live invoice with id "${id}".`);
  }
}

/**
 * Thrown when a draft is created for a `(studentId, month)` that already has a live
 * invoice — exactly one invoice exists per student per month (CLAUDE.md §7).
 * Idempotency lives in the domain, not a `UNIQUE(student_id, month)` DB index: two
 * laptops that generate the same month before a sync must *converge* to one row on
 * sync-resolve, never fail the push. The renderer resolves the stable
 * `duplicate-invoice` code; the domain stays i18n-agnostic.
 */
export class DuplicateInvoiceError extends DomainError {
  readonly code = 'duplicate-invoice';

  constructor(
    readonly studentId: StudentId,
    readonly month: string,
  ) {
    super(`Student "${studentId}" already has a live invoice for ${month}.`);
  }
}
