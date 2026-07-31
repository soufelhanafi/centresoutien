import type { InvoiceLine } from '../entities/invoice-line';

/**
 * The invoice total, in integer MAD centimes, as the sum of its line amounts. The
 * total is **derived**, never stored on the invoice header, so it can never drift
 * from the (immutable) lines. Pure and portable — the invoice view, dashboard KPIs,
 * and the PDF renderer all read it from here rather than re-summing inline.
 *
 * Callers pass the live lines of a single invoice; this function does not filter by
 * `kind` — a per-track subtotal is `invoiceTotalMad(lines.filter(l => l.kind === …))`.
 */
export function invoiceTotalMad(lines: readonly InvoiceLine[]): number {
  return lines.reduce((sum, line) => sum + line.amountMad, 0);
}
