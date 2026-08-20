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
 * ⚠️ Line writes are **draft-only** (doctrine relaxed by SOU-289, recorded on the
 * issue: previously lines were write-once with the draft). While the invoice is
 * `draft`, lines may be appended (`appendLinesToDraft` — enrollment mid-month) and a
 * line's `amountMad` may be corrected (`updateDraftLineAmount` — director override).
 * The moment the invoice leaves `draft` (issued or cancelled) the billed snapshot is
 * frozen and no line method may touch it — that freeze is still the structural
 * guarantee behind "invoice + lines immutable after `issued`". The one envelope-level
 * exception is deletion: `softDelete` cascades the tombstone onto the invoice's lines
 * (so a line read in isolation is trustworthy for deletes). Cancelling is a lifecycle
 * state, not a delete — a cancelled invoice's lines stay live.
 */
export interface InvoiceRepository extends SoftDeletableRepository<InvoiceId, Invoice> {
  /**
   * Insert a `draft` invoice header **and** its lines in one transaction. The caller
   * (the generation use cases) has already computed the billed snapshots.
   */
  createDraft(invoice: Invoice, lines: readonly InvoiceLine[]): Promise<void>;

  /**
   * Append fully-built lines to an **existing draft** in one transaction (SOU-289 —
   * a mid-month enrollment lands on the month's already-generated invoice as an
   * extra line, never as a second invoice). Draft-only contract: the adapter must
   * verify, inside the same transaction as the insert, that the header is live and
   * `status === 'draft'`, and reject with `InvoiceNotFoundError` /
   * `InvoiceNotDraftError` otherwise — an issued or cancelled invoice's lines are
   * frozen. Line-level idempotency (skip a `(formulaId, kind)` already billed) is
   * the calling use case's job, not this method's.
   */
  appendLinesToDraft(invoiceId: InvoiceId, lines: readonly InvoiceLine[]): Promise<void>;

  /**
   * Persist a draft line's corrected `amountMad` (SOU-289 director override).
   * Writes ONLY `amountMad` plus the envelope change-tracking fields
   * (`updatedAt` / `updatedBy`) of the already-`applyWrite`-advanced `line`; every
   * other billed field and `version` (hub-assigned) are never rewritten. Same
   * draft-only contract as `appendLinesToDraft`, checked in-transaction; a missing
   * or tombstoned line rejects with `InvoiceLineNotFoundError`.
   */
  updateDraftLineAmount(line: InvoiceLine): Promise<void>;

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
