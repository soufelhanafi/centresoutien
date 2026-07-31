import type { Database as DB } from 'better-sqlite3';
import type {
  Payment,
  PaymentId,
  PaymentKind,
  PaymentMethod,
  PaymentRepository,
  InvoiceId,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';

/** The `payments` table row shape as SQLite returns it. */
type PaymentRow = {
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
};

function paymentFromRow(row: PaymentRow): Payment {
  return {
    id: row.id as PaymentId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    invoiceId: row.invoice_id as InvoiceId,
    kind: row.kind as PaymentKind,
    amountMad: row.amount_mad,
    method: row.method as PaymentMethod,
    paidOn: row.paid_on,
    reversesPaymentId: row.reverses_payment_id === null ? null : (row.reverses_payment_id as PaymentId),
  };
}

function paymentToParams(payment: Payment) {
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
  };
}

// Append-only: a plain INSERT with no ON CONFLICT clause. Re-appending a payment id
// fails loudly — the structural half of "payments are never rewritten". There is no
// UPDATE path here at all; the DB trigger (0019) rejects any UPDATE/DELETE as a net.
const APPEND_PAYMENT_SQL = `
  INSERT INTO payments
    (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at,
     version, invoice_id, kind, amount_mad, method, paid_on, reverses_payment_id)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by, @deleted_at,
     @version, @invoice_id, @kind, @amount_mad, @method, @paid_on, @reverses_payment_id)
`;

// Net paid on an invoice, in centimes: Σ payments − Σ reversals. Computed in SQL so a
// balance check is one row, not a full ledger fetch. Must agree with the pure
// `netPaidMad` over the same rows (an integration test pins this). COALESCE makes an
// invoice with no payments read 0 rather than NULL.
const SUM_FOR_INVOICE_SQL = `
  SELECT COALESCE(
    SUM(CASE WHEN kind = 'reversal' THEN -amount_mad ELSE amount_mad END), 0
  ) AS net
  FROM payments
  WHERE invoice_id = ? AND deleted_at IS NULL
`;

/**
 * SQLite adapter for {@link PaymentRepository}. Pure translation between the port and
 * SQL — no business decisions. The ledger is append-only: the sole writer is `append`
 * (a plain INSERT), and the migration's BEFORE UPDATE / BEFORE DELETE triggers guarantee
 * no row can ever be mutated even outside this class. Every read hides tombstones
 * (`deleted_at IS NULL`) for uniformity, though payments are never tombstoned. Mirrors
 * {@link SqliteInvoiceRepository}.
 */
export class SqlitePaymentRepository implements PaymentRepository {
  constructor(private readonly db: DB) {}

  async append(payment: Payment): Promise<void> {
    this.db.prepare(APPEND_PAYMENT_SQL).run(paymentToParams(payment));
  }

  async findById(id: PaymentId): Promise<Payment | null> {
    const row = this.db
      .prepare('SELECT * FROM payments WHERE id = ? AND deleted_at IS NULL')
      .get(id) as PaymentRow | undefined;
    return row ? paymentFromRow(row) : null;
  }

  async listForInvoice(invoiceId: InvoiceId): Promise<readonly Payment[]> {
    const rows = this.db
      .prepare('SELECT * FROM payments WHERE invoice_id = ? AND deleted_at IS NULL ORDER BY id')
      .all(invoiceId) as PaymentRow[];
    return rows.map(paymentFromRow);
  }

  async sumForInvoice(invoiceId: InvoiceId): Promise<number> {
    const row = this.db.prepare(SUM_FOR_INVOICE_SQL).get(invoiceId) as { net: number };
    return row.net;
  }

  async listChangedSince(cursor: Date): Promise<readonly Payment[]> {
    const rows = this.db
      .prepare('SELECT * FROM payments WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as PaymentRow[];
    return rows.map(paymentFromRow);
  }
}
