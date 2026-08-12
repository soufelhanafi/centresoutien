import type { Payment, PaymentId } from '../entities/payment';
import type { InvoiceId } from '../entities/invoice';

/**
 * The **read** seam SOU-67 deferred to SOU-93: everything a consumer needs to derive
 * an invoice's payment status without knowing how payments are stored. The invoice
 * view, the dashboard money KPIs, and `derivePaymentStatus` depend on this narrow
 * port, never on the write side (interface segregation).
 */
export interface PaymentReader {
  /** Every live payment + reversal row for an invoice, oldest id first. */
  listForInvoice(invoiceId: InvoiceId): Promise<readonly Payment[]>;
  /**
   * Net paid on an invoice in centimes: `Σ payments − Σ reversals`, computed in the
   * adapter (SQL) so a hot balance check is one query, not a full ledger fetch. Must
   * agree with the pure `netPaidMad` over the same rows.
   */
  sumForInvoice(invoiceId: InvoiceId): Promise<number>;
  /**
   * The live payment for `id`, or `null` for an unknown id. A read — it backs the
   * void guards (resolve the target center-scoped, reject a reversal) without needing
   * the write side. Lives on the reader so a use case that only reads + commits through
   * the {@link import('./payment-ledger-unit-of-work').PaymentLedgerUnitOfWork} never
   * touches `append` directly (SOU-233).
   */
  findById(id: PaymentId): Promise<Payment | null>;
}

/**
 * Persistence port for the append-only {@link Payment} ledger (SOU-93). Deliberately
 * **has no `save`, `softDelete`, or update method** — a payment is written once with
 * `append` and never mutated, so this is NOT a {@link SoftDeletableRepository}. A
 * mistaken payment is corrected by appending a `reversal` (a normal `append`), never by
 * editing or deleting a row. The SQLite adapter additionally installs a
 * `BEFORE UPDATE / BEFORE DELETE` trigger as a safety net behind this contract.
 *
 * Append-only rows cannot conflict at sync: two devices' payments on one invoice union
 * together; `version` is still hub-assigned for cursor ordering, but there is never a
 * same-field clash to resolve.
 */
export interface PaymentRepository extends PaymentReader {
  /** Insert a new payment or reversal. Re-appending an existing id must fail loudly. */
  append(payment: Payment): Promise<void>;
  /** Sync cursor query: rows written strictly after `cursor` (append-only, so no tombstones). */
  listChangedSince(cursor: Date): Promise<readonly Payment[]>;
}
