import type { PaymentId, PaymentKind, PaymentMethod } from '../entities/payment';
import type { InvoiceId } from '../entities/invoice';
import type { StudentId } from '../entities/student';

/**
 * One append-only ledger row projected for the cash-desk feed (SOU-198): the
 * cross-invoice "recent payments" list behind the `/payments` page (today's
 * takings + recent feed). Unlike {@link InvoicePaymentSummary}, which is scoped
 * to a single invoice, this row carries its own `invoiceId` because the feed
 * spans every invoice of the center.
 *
 * This is a **cross-aggregate read model**, not an entity: no sync envelope,
 * never persisted or written back. Produced by
 * {@link RecentPaymentsReadPort.listRecentPayments}; `ListRecentPayments` gates
 * and bounds it. Both `payment` and `reversal` kinds are returned as-is — the
 * feed decides how to net them; the read never filters by kind.
 *
 * `studentName` (and `studentId`) is the label the feed shows next to a row. It
 * resolves through the same cheap `payment ⋈ invoice ⋈ student` join the Impayés
 * read already uses ({@link OverdueInvoiceViewReadPort}); it is `null` only when
 * the invoice (or its student) has not yet synced to this device — an archived
 * student's name still resolves, since soft-delete never removes it.
 *
 * `paidOn` is the day-granular business date (`'YYYY-MM-DD'`) the money moved —
 * a human date, not a timestamp; the feed's ordering is a display concern, never
 * a sync decision (that stays `version`-driven).
 */
export type RecentPaymentView = {
  readonly id: PaymentId;
  readonly invoiceId: InvoiceId;
  readonly kind: PaymentKind;
  readonly amountMad: number; // integer centimes, always >= 0 (reversals subtract in the feed)
  readonly method: PaymentMethod;
  readonly paidOn: string; // 'YYYY-MM-DD', the business date the money moved
  readonly studentId: StudentId | null;
  readonly studentName: { fr: string; ar: string } | null;
};

/**
 * The optional day/date-range window + hard row cap for the recent-payments feed.
 * `from`/`to` are inclusive `'YYYY-MM-DD'` bounds on `paidOn` (a single day =
 * `from === to`); either may be omitted for an open-ended bound. `limit` is
 * already clamped to a sane maximum by {@link ListRecentPayments} before it
 * reaches the port, so the adapter can trust it as a bounded `LIMIT`.
 */
export type RecentPaymentsFilters = {
  readonly from?: string; // inclusive 'YYYY-MM-DD' lower bound on paidOn
  readonly to?: string; // inclusive 'YYYY-MM-DD' upper bound on paidOn
  readonly limit: number; // hard cap, already clamped by the use case
};
