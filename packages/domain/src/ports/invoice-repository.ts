import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Invoice, InvoiceId } from '../entities/invoice';
import type { InvoiceLine } from '../entities/invoice-line';
import type { StudentId } from '../entities/student';
import type { CenterCode } from '../value-objects/ids';

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
}
