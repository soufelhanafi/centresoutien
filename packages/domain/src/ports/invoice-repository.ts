import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Invoice, InvoiceId } from '../entities/invoice';
import type { InvoiceLine } from '../entities/invoice-line';
import type { StudentId } from '../entities/student';
import type { CenterCode } from '../value-objects/ids';
import type { InvoiceListPage, InvoiceListFilters } from '../read-models/invoice-list-row';

/**
 * Persistence port for the Invoice aggregate (SOU-67). The `Invoice` header is the
 * aggregate root; its {@link InvoiceLine} rows live in their own table and are read
 * through this same port.
 *
 * Inherits the soft-deletable header surface (`save` / `findById` / `softDelete` /
 * `listChangedSince`): reads exclude tombstones, deletes are soft, and there is no
 * hard delete. `save` upserts only the header — it is the write path for the two
 * legal lifecycle transitions (`IssueInvoice`, `CancelInvoice`); it never touches
 * lines. An invoice is identified by its `(studentId, month)` relationship, so there
 * is no `findByNaturalKey`.
 *
 * ⚠️ There is deliberately **no line-update method**. A line's billed fields are
 * inserted exactly once with the draft (`createDraft`) and are read-only thereafter —
 * the structural guarantee behind "invoice + lines immutable after `issued`". The one
 * envelope-level exception is deletion: `softDelete` cascades the tombstone onto the
 * invoice's lines (so a line read in isolation is trustworthy for deletes). Cancelling
 * is a lifecycle state, not a delete — a cancelled invoice's lines stay live.
 */
export interface InvoiceRepository extends SoftDeletableRepository<InvoiceId, Invoice> {
  /**
   * Insert a `draft` invoice header **and** its lines in one transaction. Lines are
   * write-once; this is the only method that creates them. The caller (the future
   * generation use case) has already computed the frozen snapshots.
   */
  createDraft(invoice: Invoice, lines: readonly InvoiceLine[]): Promise<void>;

  /** The invoice's lines (for the total, the printed invoice, and kind-filtered KPIs). */
  listLines(invoiceId: InvoiceId): Promise<readonly InvoiceLine[]>;

  /**
   * The live header for `(centerCode, studentId, month)`, or `null` — backs the
   * one-invoice-per-student-per-month guard in `CreateInvoiceDraft`. Center-scoped in
   * the query itself (not a post-filter) so the future shared backend cannot resolve a
   * foreign tenant's row. A domain read, not a DB unique index, so concurrent
   * same-month creates converge on sync-resolve.
   */
  findByStudentMonth(
    centerCode: CenterCode,
    studentId: StudentId,
    month: string,
  ): Promise<Invoice | null>;

  /**
   * Sync cursor query for lines: rows updated strictly after `cursor`. Lines carry
   * their own envelope, so the sync feed scans them like any other table (the header
   * feed is the inherited `listChangedSince`).
   */
  listLinesChangedSince(cursor: Date): Promise<readonly InvoiceLine[]>;

  /**
   * Batch read for the invoice list + detail screens (SOU-69): every live invoice
   * matching the structural filters (`month` / `studentId` / `invoiceId` /
   * `openOnly` / `search`, all optional — an empty filter set is "every live
   * invoice of the center"), each paired with its lines and its total/net-paid,
   * computed in the adapter's join — **two queries total, never one per invoice**.
   * Cancelled invoices are included (never hidden); the caller badges them by
   * `invoice.status`. The tri-state derived payment-status filter is NOT applied
   * here — see {@link ListInvoices}.
   *
   * Unpaginated (`pageSize` unset): every match, ordered newest month first,
   * `nextCursor: null`. Paginated (`pageSize` set): a single bounded page ordered
   * by `id DESC` (keyset, not OFFSET), with `nextCursor` set to the last row's id
   * when more rows remain — pass it back as `cursor` for the next page.
   */
  listInvoices(
    centerCode: CenterCode,
    filters: InvoiceListFilters,
  ): Promise<InvoiceListPage>;

  /**
   * Every **live** header for `(centerCode, month)`, any status — the center-wide read
   * `MonthlyFeeAttributionService` (SOU-74) needs to assemble teacher-fee attribution for
   * a month without a per-student round trip. Filtering to `issued` (the only status that
   * can be collected) is the caller's job, not this adapter's, mirroring
   * `StudentSubscriptionRepository.listLiveByCenter`.
   */
  listByCenterMonth(centerCode: CenterCode, month: string): Promise<readonly Invoice[]>;
}
