import type { Database as DB } from 'better-sqlite3';
import type {
  Payment,
  PaymentId,
  PaymentKind,
  PaymentMethod,
  PaymentRepository,
  RecentPaymentsReadPort,
  RecentPaymentView,
  RecentPaymentsFilters,
  DayTakings,
  InvoiceId,
  StudentId,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';
import { PAYMENT_METHODS } from '@centresoutien/domain';
import {
  type PaymentRow,
  paymentToParams,
  APPEND_PAYMENT_SQL,
  SUM_FOR_INVOICE_SQL,
} from './payment-sql';

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
    note: row.note,
  };
}

/** The `payments` ⋈ `invoices` ⋈ `students` row shape behind
 *  {@link RecentPaymentsReadPort.listRecentPayments} (SOU-198). `student_*` are null
 *  when the payment's invoice header (or its student) hasn't synced to this device. */
type RecentPaymentQueryRow = {
  id: string;
  invoice_id: string;
  kind: string;
  amount_mad: number;
  method: string;
  paid_on: string;
  student_id: string | null;
  student_name_fr: string | null;
  student_name_ar: string | null;
};

function recentPaymentFromRow(row: RecentPaymentQueryRow): RecentPaymentView {
  return {
    id: row.id as PaymentId,
    invoiceId: row.invoice_id as InvoiceId,
    kind: row.kind as PaymentKind,
    amountMad: row.amount_mad,
    method: row.method as PaymentMethod,
    paidOn: row.paid_on,
    studentId: row.student_id === null ? null : (row.student_id as StudentId),
    studentName:
      row.student_name_fr === null || row.student_name_ar === null
        ? null
        : { fr: row.student_name_fr, ar: row.student_name_ar },
  };
}

/**
 * SQLite adapter for {@link PaymentRepository}. Pure translation between the port and
 * SQL — no business decisions. The ledger is append-only: the sole writer is `append`
 * (a plain INSERT), and the migration's BEFORE UPDATE / BEFORE DELETE triggers guarantee
 * no row can ever be mutated even outside this class. Every read hides tombstones
 * (`deleted_at IS NULL`) for uniformity, though payments are never tombstoned. Mirrors
 * {@link SqliteInvoiceRepository}.
 *
 * Also implements {@link RecentPaymentsReadPort} (SOU-198) — the cash-desk feed's
 * cross-invoice read, anchored on `payments` like every other read this class owns,
 * mirroring how `SqliteInvoiceRepository` carries `OverdueInvoiceViewReadPort`.
 */
export class SqlitePaymentRepository implements PaymentRepository, RecentPaymentsReadPort {
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

  // The LEFT JOINs leave the student label null for an invoice/student that has not
  // synced yet — the same degradation the Impayés read accepts. Rows are returned
  // un-netted; the caller nets payments against reversals.
  async listRecentPayments(
    centerCode: CenterCode,
    filters: RecentPaymentsFilters,
  ): Promise<readonly RecentPaymentView[]> {
    const conditions = ['p.center_code = @center_code', 'p.deleted_at IS NULL'];
    const params: Record<string, string | number> = {
      center_code: centerCode,
      limit: filters.limit,
    };
    if (filters.from !== undefined) {
      conditions.push('p.paid_on >= @from');
      params['from'] = filters.from;
    }
    if (filters.to !== undefined) {
      conditions.push('p.paid_on <= @to');
      params['to'] = filters.to;
    }

    const rows = this.db
      .prepare(
        `SELECT p.id AS id, p.invoice_id AS invoice_id, p.kind AS kind,
                p.amount_mad AS amount_mad, p.method AS method, p.paid_on AS paid_on,
                i.student_id AS student_id,
                s.name_fr AS student_name_fr, s.name_ar AS student_name_ar
         FROM payments p
         LEFT JOIN invoices i ON i.id = p.invoice_id
         LEFT JOIN students s ON s.id = i.student_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY p.paid_on DESC, p.id DESC
         LIMIT @limit`,
      )
      .all(params) as RecentPaymentQueryRow[];

    return rows.map(recentPaymentFromRow);
  }

  // Nets reversals in SQL (Σ payments − Σ reversals) so the day total never depends on a
  // row cap — the reason this exists apart from the capped `payment.recent` feed.
  async getDayTakings(centerCode: CenterCode, day: string): Promise<DayTakings> {
    const rows = this.db
      .prepare(
        `SELECT method,
                COALESCE(SUM(CASE WHEN kind = 'reversal' THEN -amount_mad ELSE amount_mad END), 0) AS net_mad,
                SUM(CASE WHEN kind = 'payment' THEN 1 ELSE 0 END) AS payment_count
         FROM payments
         WHERE center_code = @center_code AND deleted_at IS NULL AND paid_on = @day
         GROUP BY method`,
      )
      .all({ center_code: centerCode, day }) as {
      method: string;
      net_mad: number;
      payment_count: number;
    }[];

    const byMethod = Object.fromEntries(
      PAYMENT_METHODS.map((method) => [method, 0]),
    ) as Record<PaymentMethod, number>;
    let netMad = 0;
    let paymentCount = 0;
    for (const row of rows) {
      byMethod[row.method as PaymentMethod] = row.net_mad;
      netMad += row.net_mad;
      paymentCount += row.payment_count;
    }

    return { netMad, paymentCount, byMethod };
  }
}
