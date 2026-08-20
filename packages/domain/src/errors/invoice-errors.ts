import { DomainError } from './plan-errors';
import type { InvoiceId, InvoiceStatus } from '../entities/invoice';
import type { InvoiceLineId } from '../entities/invoice-line';
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
 * Thrown when a payment is recorded against an invoice that is not in the `issued`
 * lifecycle state (SOU-232 / audit CS-AUD-001). A `draft` has not yet been billed to
 * the family and a `cancelled` invoice no longer owes anything — taking money against
 * either is a real-world error, not a partial payment. Distinct from
 * {@link InvoiceNotFoundError} (a live, resolvable invoice exists; it is just not in a
 * payable state), so the cash desk sees *why* the entry was refused. The renderer
 * resolves the stable `invoice-not-payable` code; the domain stays i18n-agnostic.
 */
export class InvoiceNotPayableError extends DomainError {
  readonly code = 'invoice-not-payable';

  constructor(
    readonly invoiceId: InvoiceId,
    readonly status: InvoiceStatus,
  ) {
    super(`Invoice "${invoiceId}" is "${status}", not "issued": it cannot take a payment.`);
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

/**
 * Thrown when a line-level write targets an invoice that is not in the `draft`
 * lifecycle state (SOU-289). Lines are mutable/appendable only while the invoice is
 * a draft; the moment it is `issued` the billed snapshot is frozen, and a
 * `cancelled` invoice is deliberately closed history — neither may gain or change a
 * line. Distinct from {@link InvoiceNotFoundError} (the invoice resolves; it is
 * just past the editable state). The renderer resolves the stable
 * `invoice-not-draft` code; the domain stays i18n-agnostic.
 */
export class InvoiceNotDraftError extends DomainError {
  readonly code = 'invoice-not-draft';

  constructor(
    readonly invoiceId: InvoiceId,
    readonly status: InvoiceStatus,
  ) {
    super(`Invoice "${invoiceId}" is "${status}", not "draft": its lines are frozen.`);
  }
}

/**
 * Thrown when a line-level operation names a line id with no live row on the given
 * invoice — unknown, already tombstoned, or belonging to a different invoice. The
 * renderer resolves the stable `invoice-line-not-found` code; the domain stays
 * i18n-agnostic.
 */
export class InvoiceLineNotFoundError extends DomainError {
  readonly code = 'invoice-line-not-found';

  constructor(
    readonly invoiceId: InvoiceId,
    readonly lineId: InvoiceLineId,
  ) {
    super(`No live line "${lineId}" on invoice "${invoiceId}".`);
  }
}

/**
 * Thrown when `ListInvoices` is asked to combine `pageSize` (keyset pagination,
 * applied in SQL before the LIMIT) with `paymentStatus` (the tri-state derived
 * filter, applied in-memory after the page is fetched). The two are mutually
 * exclusive: filtering after the LIMIT would return short pages and a `nextCursor`
 * that skips rows. The open-invoice picker uses `openOnly` (SQL-side) instead. The
 * renderer resolves the stable `invalid-invoice-list-query` code; the domain stays
 * i18n-agnostic.
 */
export class InvalidInvoiceListQueryError extends DomainError {
  readonly code = 'invalid-invoice-list-query';

  constructor() {
    super('paymentStatus cannot be combined with pageSize: paginate with openOnly instead.');
  }
}
