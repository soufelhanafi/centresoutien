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
  readonly lines: readonly InvoiceLine[];
  readonly totalMad: number;
  readonly netPaidMad: number;
};

/** Structural filters `listInvoices` applies in SQL — cheap, indexed columns only.
 *  The derived payment-status filter is NOT here; it is applied by `ListInvoices`
 *  in-memory once `totalMad`/`netPaidMad` are known. */
export type InvoiceListFilters = {
  month?: string;
  studentId?: StudentId;
  invoiceId?: InvoiceId;
};
