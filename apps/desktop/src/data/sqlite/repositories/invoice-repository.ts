import type { Database as DB } from 'better-sqlite3';
import type {
  Invoice,
  InvoiceId,
  InvoiceLine,
  InvoiceLineId,
  InvoiceRepository,
  InvoiceStatus,
  CenterCode,
  DeviceId,
  GroupKind,
  StudentId,
  UserId,
} from '@centresoutien/domain';

/** The `invoices` table row shape as SQLite returns it. */
type InvoiceRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  student_id: string;
  month: string;
  status: string;
  issued_at: string | null;
  cancelled_at: string | null;
};

/** The `invoice_lines` table row shape as SQLite returns it. */
type InvoiceLineRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  invoice_id: string;
  formula_id: string;
  label_fr: string;
  label_ar: string;
  kind: string;
  amount_mad: number;
};

function invoiceFromRow(row: InvoiceRow): Invoice {
  return {
    id: row.id as InvoiceId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    studentId: row.student_id as StudentId,
    month: row.month,
    status: row.status as InvoiceStatus,
    issuedAt: row.issued_at === null ? null : new Date(row.issued_at),
    cancelledAt: row.cancelled_at === null ? null : new Date(row.cancelled_at),
  };
}

function lineFromRow(row: InvoiceLineRow): InvoiceLine {
  return {
    id: row.id as InvoiceLineId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    invoiceId: row.invoice_id as InvoiceId,
    formulaId: row.formula_id,
    label: { fr: row.label_fr, ar: row.label_ar },
    kind: row.kind as GroupKind,
    amountMad: row.amount_mad,
  };
}

function invoiceToParams(invoice: Invoice) {
  return {
    id: invoice.id,
    center_code: invoice.centerCode,
    device_origin: invoice.deviceOrigin,
    created_at: invoice.createdAt.toISOString(),
    updated_at: invoice.updatedAt.toISOString(),
    updated_by: invoice.updatedBy,
    deleted_at: invoice.deletedAt ? invoice.deletedAt.toISOString() : null,
    version: invoice.version,
    student_id: invoice.studentId,
    month: invoice.month,
    status: invoice.status,
    issued_at: invoice.issuedAt ? invoice.issuedAt.toISOString() : null,
    cancelled_at: invoice.cancelledAt ? invoice.cancelledAt.toISOString() : null,
  };
}

function lineToParams(line: InvoiceLine) {
  return {
    id: line.id,
    center_code: line.centerCode,
    device_origin: line.deviceOrigin,
    created_at: line.createdAt.toISOString(),
    updated_at: line.updatedAt.toISOString(),
    updated_by: line.updatedBy,
    deleted_at: line.deletedAt ? line.deletedAt.toISOString() : null,
    version: line.version,
    invoice_id: line.invoiceId,
    formula_id: line.formulaId,
    label_fr: line.label.fr,
    label_ar: line.label.ar,
    kind: line.kind,
    amount_mad: line.amountMad,
  };
}

// Header upsert. Identity columns (id, center_code, device_origin, created_at,
// student_id, month) are NEVER rewritten — only the envelope change-tracking columns
// and the lifecycle fields (status, issued_at, cancelled_at) move. This is the write
// path for the IssueInvoice / CancelInvoice transitions.
const SAVE_INVOICE_SQL = `
  INSERT INTO invoices
    (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at,
     version, student_id, month, status, issued_at, cancelled_at)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by, @deleted_at,
     @version, @student_id, @month, @status, @issued_at, @cancelled_at)
  ON CONFLICT(id) DO UPDATE SET
    updated_at   = excluded.updated_at,
    updated_by   = excluded.updated_by,
    deleted_at   = excluded.deleted_at,
    version      = excluded.version,
    status       = excluded.status,
    issued_at    = excluded.issued_at,
    cancelled_at = excluded.cancelled_at
`;

// Lines are write-once: a plain INSERT with no ON CONFLICT clause. Re-inserting a
// line id fails loudly — the structural half of "lines immutable after issued".
const INSERT_LINE_SQL = `
  INSERT INTO invoice_lines
    (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at,
     version, invoice_id, formula_id, label_fr, label_ar, kind, amount_mad)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by, @deleted_at,
     @version, @invoice_id, @formula_id, @label_fr, @label_ar, @kind, @amount_mad)
`;

/**
 * SQLite adapter for {@link InvoiceRepository}. Pure translation between the port and
 * SQL — no business decisions. Every header/line read hides tombstones
 * (`deleted_at IS NULL`); only the sync feeds (`listChangedSince` /
 * `listLinesChangedSince`) see them. Soft-delete only — there is no hard `DELETE`. A
 * line's billed fields are never rewritten (the line INSERT has no upsert); the sole
 * line UPDATE is the tombstone that `softDelete` cascades from the header. Mirrors
 * {@link SqliteEnrollmentRepository}.
 */
export class SqliteInvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: DB) {}

  async save(invoice: Invoice): Promise<void> {
    this.db.prepare(SAVE_INVOICE_SQL).run(invoiceToParams(invoice));
  }

  /** Insert the draft header + all its lines in one transaction (write-once lines). */
  async createDraft(invoice: Invoice, lines: readonly InvoiceLine[]): Promise<void> {
    const insertAll = this.db.transaction((inv: Invoice, rows: readonly InvoiceLine[]) => {
      this.db.prepare(SAVE_INVOICE_SQL).run(invoiceToParams(inv));
      const insertLine = this.db.prepare(INSERT_LINE_SQL);
      for (const line of rows) {
        insertLine.run(lineToParams(line));
      }
    });
    insertAll(invoice, lines);
  }

  async findById(id: InvoiceId): Promise<Invoice | null> {
    const row = this.db
      .prepare('SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL')
      .get(id) as InvoiceRow | undefined;
    return row ? invoiceFromRow(row) : null;
  }

  async findByStudentMonth(
    centerCode: CenterCode,
    studentId: StudentId,
    month: string,
  ): Promise<Invoice | null> {
    const row = this.db
      .prepare(
        'SELECT * FROM invoices WHERE center_code = ? AND student_id = ? AND month = ? AND deleted_at IS NULL LIMIT 1',
      )
      .get(centerCode, studentId, month) as InvoiceRow | undefined;
    return row ? invoiceFromRow(row) : null;
  }

  // Tombstone the header AND its live lines in one transaction. Tombstoning is the one
  // envelope-level write lines accept (it is not a billed-field rewrite): without it a
  // discarded invoice's lines would stay `deleted_at IS NULL` forever, and any
  // cross-invoice, kind-level line scan (dashboard, teacher-fee attribution) would
  // silently count them. Cancelling an invoice is a *lifecycle* state, not a delete —
  // its lines stay live by design, so those scans must still join the header status.
  async softDelete(id: InvoiceId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    const cascade = this.db.transaction((invoiceId: InvoiceId) => {
      this.db
        .prepare('UPDATE invoices SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?')
        .run(iso, iso, by, invoiceId);
      this.db
        .prepare(
          'UPDATE invoice_lines SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE invoice_id = ? AND deleted_at IS NULL',
        )
        .run(iso, iso, by, invoiceId);
    });
    cascade(id);
  }

  async listChangedSince(cursor: Date): Promise<readonly Invoice[]> {
    const rows = this.db
      .prepare('SELECT * FROM invoices WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as InvoiceRow[];
    return rows.map(invoiceFromRow);
  }

  async listLines(invoiceId: InvoiceId): Promise<readonly InvoiceLine[]> {
    const rows = this.db
      .prepare('SELECT * FROM invoice_lines WHERE invoice_id = ? AND deleted_at IS NULL ORDER BY id')
      .all(invoiceId) as InvoiceLineRow[];
    return rows.map(lineFromRow);
  }

  async listLinesChangedSince(cursor: Date): Promise<readonly InvoiceLine[]> {
    const rows = this.db
      .prepare('SELECT * FROM invoice_lines WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as InvoiceLineRow[];
    return rows.map(lineFromRow);
  }
}
