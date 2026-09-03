import type { Invoice, InvoiceId } from '../entities/invoice';
import type { InvoiceLine } from '../entities/invoice-line';
import type { StudentId } from '../entities/student';

/**
 * One invoice's structural read row for the list/detail query (SOU-69): the live
 * header, its immutable lines (needed for the detail view's kind-grouped
 * breakdown and the PDF export), and the money computed once in the adapter's
 * join — `totalMad` (sum of `lines`, must agree with the pure
 * {@link invoiceTotalMad}) and `netPaidMad` (sum of the payment ledger, same
 * formula as {@link PaymentReader.sumForInvoice}). Computed in SQL so listing a
 * center's invoices is two queries total (headers+totals, then a batched line
 * fetch), never one query per invoice.
 *
 * This is a **cross-aggregate read model**, not an entity: no sync envelope, never
 * persisted or written back. Produced by {@link InvoiceRepository.listInvoices}.
 */
export type InvoiceListRow = {
  readonly invoice: Invoice;
  /** The invoice's student's bilingual name, resolved in the same join — lets the
   *  open-invoice picker label rows without a separate full-student-list fetch.
   *  Empty strings only when the student row hasn't (yet) synced to this device. */
  readonly studentName: { fr: string; ar: string };
  readonly lines: readonly InvoiceLine[];
  readonly totalMad: number;
  readonly netPaidMad: number;
};

/** Upper bound the adapter clamps `pageSize` to — a single bounded page is never
 *  a whole-center dump. Also the ceiling the IPC request schema enforces. */
export const INVOICE_LIST_MAX_PAGE_SIZE = 100;

/** Structural filters `listInvoices` applies in SQL — cheap, indexed columns only,
 *  plus the two SQL-side derived filters keyset pagination needs applied *before*
 *  the LIMIT: `openOnly` and `search`.
 *
 *  The tri-state derived payment-status filter is NOT here; it stays in
 *  `ListInvoices` in-memory (its enum formula must live in exactly one place).
 *  `openOnly` is the one derived predicate the adapter DOES apply, because it is a
 *  plain arithmetic `outstanding > 0` on the join's already-computed totals — not
 *  the status enum — and because a filter that runs after the page LIMIT would
 *  return short, wrongly-cursored pages. */
export type InvoiceListFilters = {
  month?: string;
  studentId?: StudentId;
  invoiceId?: InvoiceId;
  /** `status !== 'cancelled' && outstandingMad > 0` — the "still owes money"
   *  set backing the cash-desk payment picker (SOU-200). Applied in SQL. */
  openOnly?: boolean;
  /** Case-insensitive substring over the student's `fr`/`ar` name. Applied in SQL. */
  search?: string;
  /** Opaque keyset cursor for the next page — an exclusive upper bound on the
   *  adapter's own `(created_at, id)` ordering. Invoice ids are a deterministic
   *  composite key (`deriveInvoiceId`), not a time-sortable ULID, so recency is
   *  carried by `created_at`, with `id` only as the tiebreaker; the packing is
   *  the SQLite adapter's own concern, never inspected by callers. Omitted for
   *  the first page. Only honored when `pageSize` is set. */
  cursor?: string;
  /** Bounded page size. When set, the read is paginated (ordered by `created_at DESC, id DESC`) and
   *  returns a `nextCursor`; the adapter clamps to {@link INVOICE_LIST_MAX_PAGE_SIZE}.
   *  When omitted, every matching row is returned and `nextCursor` is `null`. */
  pageSize?: number;
};

/** One page of {@link InvoiceListRow}s plus the keyset cursor to fetch the next one
 *  (`null` when this is the last page or the read was unpaginated). Returned by
 *  {@link InvoiceRepository.listInvoices}. */
export type InvoiceListPage = {
  readonly rows: readonly InvoiceListRow[];
  readonly nextCursor: string | null;
};
