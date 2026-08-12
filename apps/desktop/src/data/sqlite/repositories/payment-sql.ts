import type { Payment } from '@centresoutien/domain';

/** The `payments` table row shape as SQLite returns it. */
export type PaymentRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  invoice_id: string;
  kind: string;
  amount_mad: number;
  method: string;
  paid_on: string;
  reverses_payment_id: string | null;
  note: string | null;
};

export function paymentToParams(payment: Payment) {
  return {
    id: payment.id,
    center_code: payment.centerCode,
    device_origin: payment.deviceOrigin,
    created_at: payment.createdAt.toISOString(),
    updated_at: payment.updatedAt.toISOString(),
    updated_by: payment.updatedBy,
    deleted_at: payment.deletedAt ? payment.deletedAt.toISOString() : null,
    version: payment.version,
    invoice_id: payment.invoiceId,
    kind: payment.kind,
    amount_mad: payment.amountMad,
    method: payment.method,
    paid_on: payment.paidOn,
    reverses_payment_id: payment.reversesPaymentId,
    note: payment.note,
  };
}

// Append-only: a plain INSERT with no ON CONFLICT clause. Re-appending a payment id
// fails loudly — the structural half of "payments are never rewritten". There is no
// UPDATE path here at all; the DB trigger (0019) rejects any UPDATE/DELETE as a net,
// and the partial-unique index (0042) rejects a second reversal of the same payment.
export const APPEND_PAYMENT_SQL = `
  INSERT INTO payments
    (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at,
     version, invoice_id, kind, amount_mad, method, paid_on, reverses_payment_id, note)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by, @deleted_at,
     @version, @invoice_id, @kind, @amount_mad, @method, @paid_on, @reverses_payment_id, @note)
`;

// Net paid on an invoice, in centimes: Σ payments − ONE reversal per reversed payment.
// Reversals are collapsed by `reverses_payment_id` (a payment is voided at most once,
// SOU-233) so a legacy double-void — two reversals of one payment from an offline
// collision before the guard existed — cannot double-subtract and drive the net
// negative. Computed in SQL so a balance check is one row, not a full ledger fetch; must
// agree with the pure `netPaidMadDeduped` over the same rows (an integration test pins
// this). COALESCE makes an invoice with no payments read 0 rather than NULL. Named
// `@invoice_id` (used twice) so both sub-selects bind the one value.
export const SUM_FOR_INVOICE_SQL = `
  SELECT
    COALESCE((
      SELECT SUM(amount_mad) FROM payments
       WHERE invoice_id = @invoice_id AND deleted_at IS NULL AND kind = 'payment'
    ), 0)
    -
    COALESCE((
      SELECT SUM(rev_amount) FROM (
        SELECT MIN(amount_mad) AS rev_amount
          FROM payments
         WHERE invoice_id = @invoice_id AND deleted_at IS NULL AND kind = 'reversal'
         GROUP BY reverses_payment_id
      )
    ), 0) AS net
`;
