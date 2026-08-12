import type { Invoice } from '../entities/invoice';
import { InvoiceNotPayableError } from '../errors/invoice-errors';

/**
 * The single guard for "may this invoice take a payment?" (SOU-232 / audit CS-AUD-001).
 * An invoice's lifecycle is `draft → issued → cancelled`; only an `issued` invoice has
 * been billed to the family and still owes money, so it is the only payable state.
 *
 * Recording a payment against a `draft` (never issued) or a `cancelled` invoice is a
 * real-world mistake — not a partial payment — and must be refused *before* any ledger
 * read or write. `RecordPayment` calls this right after resolving the (center-scoped)
 * invoice and before touching the payment ledger.
 *
 * Kept as its own tiny policy, not inlined, so the rule lives in exactly one place and
 * a future payable state (e.g. a re-issued credit note) is a one-line change here.
 */
export function assertInvoicePayable(invoice: Invoice): void {
  if (invoice.status !== 'issued') {
    throw new InvoiceNotPayableError(invoice.id, invoice.status);
  }
}

/** True iff `invoice` is in a state that may take a payment. The non-throwing form of
 *  {@link assertInvoicePayable}, for read-side callers (e.g. the UI enabling a button). */
export function isInvoicePayable(invoice: Invoice): boolean {
  return invoice.status === 'issued';
}
