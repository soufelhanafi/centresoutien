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
// and the in-tx guard in SqlitePaymentLedgerUnitOfWork (plus the data-conditional
// ux_payments_reversal_once backstop) rejects a second reversal of the same payment.
export const APPEND_PAYMENT_SQL = `
  INSERT INTO payments
    (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at,
     version, invoice_id, kind, amount_mad, method, paid_on, reverses_payment_id, note)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by, @deleted_at,
     @version, @invoice_id, @kind, @amount_mad, @method, @paid_on, @reverses_payment_id, @note)
`;

// A ledger row's signed contribution to net paid, deduping reversals to ONE per reversed
// payment (SOU-233). A payment is voided at most once, so of the (possibly several,
// after a legacy offline double-void) reversals of one payment, only the LOWEST-id one
// counts — the same lowest-ULID winner the pure `netPaidMad` picks, and using THAT row's
// amount so SQL and domain provably agree even if two reversals of one payment ever
// carried different amounts. Payments contribute +amount; the winning reversal −amount;
// any losing duplicate reversal 0. Tombstones excluded (payments are never tombstoned;
// the filter keeps the sum honest). The single netting fragment every read path shares
// (invoice balance, invoice/overdue lists, day-takings) so no two screens can disagree.
export const SIGNED_LEDGER_ROWS_SQL = `
  SELECT
    p.invoice_id  AS invoice_id,
    p.center_code AS center_code,
    p.paid_on     AS paid_on,
    p.method      AS method,
    p.kind        AS kind,
    CASE
      WHEN p.kind = 'payment' THEN p.amount_mad
      WHEN p.id = (
        SELECT MIN(r.id) FROM payments r
         WHERE r.reverses_payment_id = p.reverses_payment_id
           AND r.kind = 'reversal' AND r.deleted_at IS NULL
      ) THEN -p.amount_mad
      ELSE 0
    END AS signed_mad
  FROM payments p
  WHERE p.deleted_at IS NULL
`;

// Net paid on an invoice, in centimes — one row. Must agree with the pure `netPaidMad`
// over the same rows (an integration test pins this, including unequal-amount duplicate
// reversals). COALESCE makes an invoice with no payments read 0 rather than NULL.
export const SUM_FOR_INVOICE_SQL = `
  SELECT COALESCE(SUM(signed_mad), 0) AS net
    FROM (${SIGNED_LEDGER_ROWS_SQL})
   WHERE invoice_id = @invoice_id
`;

// (invoice_id, net_paid_mad) deduped — the grouped netting the invoice-list and overdue
// read models LEFT JOIN, so every invoice surface reports the same net as the balance
// check and the domain summary.
export const NET_PAID_BY_INVOICE_SQL = `
  SELECT invoice_id, SUM(signed_mad) AS net_paid_mad
    FROM (${SIGNED_LEDGER_ROWS_SQL})
   GROUP BY invoice_id
`;
