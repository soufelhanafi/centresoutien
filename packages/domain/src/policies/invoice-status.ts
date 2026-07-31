import type { InvoiceStatus } from '../entities/invoice';

/**
 * The monthly-invoice lifecycle state machine (SOU-67). A pure, portable policy: no
 * clock, no I/O — it answers only "is this transition legal?". The use cases
 * (`IssueInvoice`, `CancelInvoice`) consult it before mutating, and the renderer can
 * reuse it to enable/disable actions.
 *
 * Transitions:
 *   draft   → issued     (issue the invoice; lines freeze)
 *   draft   → cancelled  (discard a draft)
 *   issued  → cancelled  (void an issued invoice — a correction is a new invoice)
 *   cancelled → ∅        (terminal; nothing leaves it)
 *
 * There is deliberately no `issued → draft` (an issued invoice is immutable, only its
 * status may still move — to `cancelled`) and no self-transition. Paid-ness is not
 * in this machine at all: it is derived from `Payment` records (SOU-93), not a state.
 */
export const INVOICE_STATUS_TRANSITIONS: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> =
  {
    draft: ['issued', 'cancelled'],
    issued: ['cancelled'],
    cancelled: [],
  };

/** True when moving an invoice from `from` to `to` is a legal lifecycle transition. */
export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return INVOICE_STATUS_TRANSITIONS[from].includes(to);
}
