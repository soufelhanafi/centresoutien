import type { Database as DB } from 'better-sqlite3';
import { z } from 'zod';
import {
  INVOICE_STATUSES,
  INVOICE_LIST_MAX_PAGE_SIZE,
  foldSearchText,
  invoiceSubjectAllocationSchema,
  InvoiceLineNotFoundError,
  InvoiceNotDraftError,
  InvoiceNotFoundError,
} from '@centresoutien/domain';
import type {
  Invoice,
  InvoiceId,
  InvoiceLine,
  InvoiceLineId,
  InvoiceRepository,
  InvoiceStatus,
  InvoiceListRow,
  InvoiceListFilters,
  InvoiceListPage,
  InvoiceSubjectAllocation,
  CenterCode,
  DeviceId,
  FormulaId,
  GroupId,
  GroupKind,
  StudentId,
  SubjectId,
  ParentId,
  UserId,
  OverdueInvoiceViewReadPort,
  OverdueInvoiceLineView,
} from '@centresoutien/domain';
import { NET_PAID_BY_INVOICE_SQL } from './payment-sql';

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
  subject_allocation: string | null;
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

/** The `invoices` ⋈ `students` ⋈ `invoice_lines` ⋈ `payments` row shape behind
 *  {@link OverdueInvoiceViewReadPort.listIssuedInvoiceLines}. `student_name_*` /
 *  `guardian_ids` are null when the student row hasn't (yet) synced to this device. */
type OverdueInvoiceQueryRow = {
  invoice_id: string;
  month: string;
  student_id: string;
  student_name_fr: string | null;
  student_name_ar: string | null;
  guardian_ids: string | null;
  total_mad: number;
  net_paid_mad: number;
};

/** Narrows the `assertLiveDraft` status probe without an `as` cast: the row is
 *  `unknown` until zod proves it carries a legal lifecycle status. */
const invoiceStatusRowSchema = z.object({ status: z.enum(INVOICE_STATUSES) });

/** Narrows the live `(formula_id, kind)` probe behind `appendLinesToDraft`'s
 *  in-transaction idempotency check. */
const billedLineKeyRowSchema = z.object({ formula_id: z.string(), kind: z.string() });

/** Parse the stored JSON guardian array back into branded ParentIds — mirrors
 *  `SqliteStudentRepository`'s own parser (not exported from there). */
function parseGuardianIds(json: string | null): ParentId[] {
  if (json === null) return [];
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((value): value is string => typeof value === 'string') as ParentId[];
}

/**
 * `listInvoices`'s keyset pagination cursor, packed as an opaque string so the
 * domain's `cursor?: string` type never has to know it is secretly two values.
 * `::` is a safe separator: `createdAt` is an ISO-8601 timestamp and `id` is a
 * `inv_...` composite id, neither of which contains it.
 */
function packInvoiceListCursor(createdAt: string, id: string): string {
  return `${createdAt}::${id}`;
}

/** Returns `null` for a malformed cursor rather than throwing — a stray/hand-edited
 *  cursor degrades to "start from the first page" instead of crashing the read. */
function parseInvoiceListCursor(cursor: string): { createdAt: string; id: string } | null {
  const separatorIndex = cursor.indexOf('::');
  if (separatorIndex === -1) return null;
  const createdAt = cursor.slice(0, separatorIndex);
  const id = cursor.slice(separatorIndex + 2);
  if (createdAt === '' || id === '') return null;
  return { createdAt, id };
}

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
    // NULL = no manual override; attribution uses the weighted/formula split (SOU-298).
    subjectAllocation:
      row.subject_allocation === null ? null : parseSubjectAllocation(row.subject_allocation),
  };
}

/** Validate persisted `subject_allocation` JSON before trusting it — parse to
 *  `unknown` then narrow via the domain schema (mirrors `student-repository`), never a
 *  blind `as` cast on `JSON.parse`. */
const subjectAllocationSchema = z.array(invoiceSubjectAllocationSchema);

function parseSubjectAllocation(json: string): InvoiceSubjectAllocation[] {
  const parsed: unknown = JSON.parse(json);
  return subjectAllocationSchema
    .parse(parsed)
    .map((entry) => ({ subjectId: entry.subjectId as SubjectId, amountMad: entry.amountMad }));
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
    formulaId: row.formula_id as FormulaId,
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
    subject_allocation:
      invoice.subjectAllocation && invoice.subjectAllocation.length > 0
        ? JSON.stringify(invoice.subjectAllocation)
        : null,
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
     version, student_id, month, status, issued_at, cancelled_at, subject_allocation)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by, @deleted_at,
     @version, @student_id, @month, @status, @issued_at, @cancelled_at, @subject_allocation)
  ON CONFLICT(id) DO UPDATE SET
    updated_at         = excluded.updated_at,
    updated_by         = excluded.updated_by,
    deleted_at         = excluded.deleted_at,
    version            = excluded.version,
    status             = excluded.status,
    issued_at          = excluded.issued_at,
    cancelled_at       = excluded.cancelled_at,
    subject_allocation = excluded.subject_allocation
`;

// An upsert, not a plain INSERT: line ids are now deterministic
// (`deriveInvoiceLineId(invoiceId, formulaId, kind)`, SOU id-determinism follow-up),
// so `createDraft` can legitimately re-insert an id that already exists as a
// TOMBSTONED row — a director discards a draft, then regenerates the same
// student's month with the same formula bundle. `ON CONFLICT` resurrects that row
// with the fresh snapshot/envelope instead of failing the whole draft transaction
// on a primary-key clash. `appendLinesToDraft` never actually hits the conflict
// branch: its `billedKeys` check (live lines only) already excludes any id that
// could collide, since a line only ever dies by cascading from its own invoice's
// tombstone, and `appendLinesToDraft` only ever runs against a live draft.
const INSERT_LINE_SQL = `
  INSERT INTO invoice_lines
    (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at,
     version, invoice_id, formula_id, label_fr, label_ar, kind, amount_mad)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by, @deleted_at,
     @version, @invoice_id, @formula_id, @label_fr, @label_ar, @kind, @amount_mad)
  ON CONFLICT(id) DO UPDATE SET
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    deleted_at = excluded.deleted_at,
    version    = excluded.version,
    label_fr   = excluded.label_fr,
    label_ar   = excluded.label_ar,
    amount_mad = excluded.amount_mad
`;

/**
 * SQLite adapter for {@link InvoiceRepository}. Pure translation between the port and
 * SQL — no business decisions. Every header/line read hides tombstones
 * (`deleted_at IS NULL`); only the sync feeds (`listChangedSince` /
 * `listLinesChangedSince`) see them. Soft-delete only — there is no hard `DELETE`.
 * Line writes are draft-only (SOU-289): `appendLinesToDraft` and
 * `updateDraftLineAmount` both re-check, inside their own transaction, that the
 * header is a live `draft` before touching a line — the port's contract, enforced
 * structurally here as well (mirroring how the payment ledger unit-of-work re-checks
 * its invariant in-transaction). Beyond those two, the only other line UPDATEs are
 * the tombstone that `softDelete` cascades from the header, and `createDraft`'s
 * `INSERT_LINE_SQL` upsert resurrecting a tombstoned line with the same
 * deterministic id (a discard-then-regenerate on the same student-month). Mirrors
 * {@link SqliteEnrollmentRepository}.
 *
 * Also implements {@link OverdueInvoiceViewReadPort} (SOU-103) — the Impayés
 * screen's cross-aggregate read, anchored on `invoices` like every other read
 * model this class owns, mirroring how `SqliteWeeklyRecurringSessionRepository`
 * carries `WeeklySessionViewReadPort` alongside its own aggregate port.
 */
export class SqliteInvoiceRepository implements InvoiceRepository, OverdueInvoiceViewReadPort {
  constructor(private readonly db: DB) {}

  async save(invoice: Invoice): Promise<void> {
    this.db.prepare(SAVE_INVOICE_SQL).run(invoiceToParams(invoice));
  }

  /** Insert the draft header + all its lines in one transaction. */
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

  // The in-transaction (formula_id, kind) skip is the port's idempotency backstop:
  // two interleaved generators that both computed the same missing line serialize on
  // this transaction, and the second one's duplicate is dropped, not double-billed.
  async appendLinesToDraft(invoiceId: InvoiceId, lines: readonly InvoiceLine[]): Promise<void> {
    const appendAll = this.db.transaction((rows: readonly InvoiceLine[]) => {
      this.assertLiveDraft(invoiceId);
      const billedKeys = this.listLiveLineKeys(invoiceId);
      const insertLine = this.db.prepare(INSERT_LINE_SQL);
      for (const line of rows) {
        const key = `${line.formulaId}::${line.kind}`;
        if (billedKeys.has(key)) continue;
        billedKeys.add(key);
        insertLine.run(lineToParams(line));
      }
    });
    appendAll(lines);
  }

  private listLiveLineKeys(invoiceId: InvoiceId): Set<string> {
    const rows: unknown[] = this.db
      .prepare('SELECT formula_id, kind FROM invoice_lines WHERE invoice_id = ? AND deleted_at IS NULL')
      .all(invoiceId);
    return new Set(
      rows.map((row) => {
        const { formula_id, kind } = billedLineKeyRowSchema.parse(row);
        return `${formula_id}::${kind}`;
      }),
    );
  }

  async updateDraftLineAmount(line: InvoiceLine): Promise<void> {
    const update = this.db.transaction((next: InvoiceLine) => {
      this.assertLiveDraft(next.invoiceId);
      const result = this.db
        .prepare(
          `UPDATE invoice_lines
              SET amount_mad = @amount_mad, updated_at = @updated_at, updated_by = @updated_by
            WHERE id = @id AND invoice_id = @invoice_id AND deleted_at IS NULL`,
        )
        .run({
          id: next.id,
          invoice_id: next.invoiceId,
          amount_mad: next.amountMad,
          updated_at: next.updatedAt.toISOString(),
          updated_by: next.updatedBy,
        });
      if (result.changes === 0) {
        throw new InvoiceLineNotFoundError(next.invoiceId, next.id);
      }
    });
    update(line);
  }

  private assertLiveDraft(invoiceId: InvoiceId): void {
    const row: unknown = this.db
      .prepare('SELECT status FROM invoices WHERE id = ? AND deleted_at IS NULL')
      .get(invoiceId);
    if (row === undefined) {
      throw new InvoiceNotFoundError(invoiceId);
    }
    const { status } = invoiceStatusRowSchema.parse(row);
    if (status !== 'draft') {
      throw new InvoiceNotDraftError(invoiceId, status);
    }
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

  // Two queries total, never one per invoice: the header query joins two grouped
  // subqueries (line total, net paid) so totalMad/netPaidMad ride along with each
  // header row; a second batched IN(...) query then fetches every matched
  // invoice's lines in one round trip. Mirrors the anti-N+1 shape of
  // `ListGroupsWithCounts`'s batch count read.
  //
  // `openOnly` and `search` are applied here in SQL (unlike the tri-state derived
  // paymentStatus, which stays in `ListInvoices`): keyset pagination clamps rows
  // with a LIMIT, so any filter that ran after the LIMIT would hand back short,
  // wrongly-cursored pages. `openOnly` is a plain `outstanding > 0` on the join's
  // already-computed totals, not the status enum, so it duplicates no formula.
  //
  // Pagination (`pageSize` set) descends by a composite `(created_at, id)` keyset,
  // never an OFFSET, and over-fetches one row to decide whether a `nextCursor`
  // exists. Invoice ids are now deterministic (`deriveInvoiceId`, centerCode +
  // studentId + month) rather than time-sortable ULIDs, so `id` alone can no
  // longer serve as a recency cursor and would also disagree with the
  // unpaginated branch's `ORDER BY i.month DESC, i.created_at DESC`. `id` stays
  // as the tiebreaker for two rows sharing one `created_at` (guarantees a stable
  // total order, mirroring how the rest of this file compares ISO-8601
  // `updated_at`/`created_at` TEXT columns as strings). The domain's `cursor` type
  // stays an opaque `string` end-to-end; this file alone packs/unpacks both
  // values into it via `packInvoiceListCursor`/`parseInvoiceListCursor`.
  async listInvoices(
    centerCode: CenterCode,
    filters: InvoiceListFilters,
  ): Promise<InvoiceListPage> {
    const conditions = ['i.center_code = @center_code', 'i.deleted_at IS NULL'];
    const params: Record<string, string | number> = { center_code: centerCode };
    if (filters.month !== undefined) {
      conditions.push('i.month = @month');
      params['month'] = filters.month;
    }
    if (filters.studentId !== undefined) {
      conditions.push('i.student_id = @student_id');
      params['student_id'] = filters.studentId;
    }
    if (filters.invoiceId !== undefined) {
      conditions.push('i.id = @invoice_id');
      params['invoice_id'] = filters.invoiceId;
    }
    if (filters.openOnly === true) {
      conditions.push(
        "i.status <> 'cancelled' AND (COALESCE(lt.total_mad, 0) - COALESCE(pt.net_paid_mad, 0)) > 0",
      );
    }

    if (filters.search !== undefined) {
      // Fold both sides identically (nfd_fold UDF === domain foldSearchText) for
      // diacritic-insensitive matching, then escape LIKE's own metacharacters so a
      // literal `%`/`_`/`\` in the term matches itself rather than acting as a wildcard.
      const escaped = foldSearchText(filters.search).replace(/[\\%_]/g, '\\$&');
      conditions.push(
        "(nfd_fold(s.name_fr) LIKE @search ESCAPE '\\' OR nfd_fold(s.name_ar) LIKE @search ESCAPE '\\')",
      );
      params['search'] = `%${escaped}%`;
    }

    const paginated = filters.pageSize !== undefined;
    let orderAndLimit = 'ORDER BY i.month DESC, i.created_at DESC';
    let pageSize = 0;
    if (paginated) {
      pageSize = Math.min(Math.max(1, filters.pageSize ?? 1), INVOICE_LIST_MAX_PAGE_SIZE);
      if (filters.cursor !== undefined) {
        const cursor = parseInvoiceListCursor(filters.cursor);
        if (cursor !== null) {
          conditions.push(
            '(i.created_at < @cursor_created_at OR (i.created_at = @cursor_created_at AND i.id < @cursor_id))',
          );
          params['cursor_created_at'] = cursor.createdAt;
          params['cursor_id'] = cursor.id;
        }
      }
      orderAndLimit = 'ORDER BY i.created_at DESC, i.id DESC LIMIT @limit';
      params['limit'] = pageSize + 1;
    }

    const fetched = this.db
      .prepare(
        `SELECT i.*, COALESCE(lt.total_mad, 0) AS total_mad, COALESCE(pt.net_paid_mad, 0) AS net_paid_mad,
                s.name_fr AS student_name_fr, s.name_ar AS student_name_ar
         FROM invoices i
         -- Intentionally no s.deleted_at filter: an outstanding invoice must keep
         -- showing (and stay searchable by) its payer's name after the student is
         -- archived. The invoice itself, not the student join, decides visibility.
         LEFT JOIN students s ON s.id = i.student_id
         LEFT JOIN (
           SELECT invoice_id, SUM(amount_mad) AS total_mad
           FROM invoice_lines
           WHERE deleted_at IS NULL
           GROUP BY invoice_id
         ) lt ON lt.invoice_id = i.id
         LEFT JOIN (
           ${NET_PAID_BY_INVOICE_SQL}
         ) pt ON pt.invoice_id = i.id
         WHERE ${conditions.join(' AND ')}
         ${orderAndLimit}`,
      )
      .all(params) as (InvoiceRow & {
      total_mad: number;
      net_paid_mad: number;
      student_name_fr: string | null;
      student_name_ar: string | null;
    })[];

    const hasMore = paginated && fetched.length > pageSize;
    const headerRows = hasMore ? fetched.slice(0, pageSize) : fetched;
    const lastRow = headerRows[headerRows.length - 1];
    const nextCursor = hasMore && lastRow ? packInvoiceListCursor(lastRow.created_at, lastRow.id) : null;

    if (headerRows.length === 0) return { rows: [], nextCursor: null };

    const placeholders = headerRows.map(() => '?').join(', ');
    const lineRows = this.db
      .prepare(
        `SELECT * FROM invoice_lines WHERE invoice_id IN (${placeholders}) AND deleted_at IS NULL ORDER BY invoice_id, id`,
      )
      .all(...headerRows.map((row) => row.id)) as InvoiceLineRow[];

    const linesByInvoice = new Map<string, InvoiceLine[]>();
    for (const lineRow of lineRows) {
      const line = lineFromRow(lineRow);
      const forInvoice = linesByInvoice.get(lineRow.invoice_id);
      if (forInvoice) forInvoice.push(line);
      else linesByInvoice.set(lineRow.invoice_id, [line]);
    }

    const rows: InvoiceListRow[] = headerRows.map((row) => ({
      invoice: invoiceFromRow(row),
      studentName: { fr: row.student_name_fr ?? '', ar: row.student_name_ar ?? '' },
      lines: linesByInvoice.get(row.id) ?? [],
      totalMad: row.total_mad,
      netPaidMad: row.net_paid_mad,
    }));
    return { rows, nextCursor };
  }

  async listByCenterMonth(centerCode: CenterCode, month: string): Promise<readonly Invoice[]> {
    const rows = this.db
      .prepare('SELECT * FROM invoices WHERE center_code = ? AND month = ? AND deleted_at IS NULL')
      .all(centerCode, month) as InvoiceRow[];
    return rows.map(invoiceFromRow);
  }

  // Two queries total, never one per invoice, same anti-N+1 shape as `listInvoices`:
  // the header query LEFT JOINs the student (for its name + guardian_ids) and the two
  // grouped subqueries (line total, net paid); a second batched query then resolves
  // every matched student's live enrolled groups in one round trip.
  async listIssuedInvoiceLines(centerCode: CenterCode): Promise<readonly OverdueInvoiceLineView[]> {
    const rows = this.db
      .prepare(
        `SELECT i.id AS invoice_id, i.month AS month, i.student_id AS student_id,
                s.name_fr AS student_name_fr, s.name_ar AS student_name_ar,
                s.guardian_ids AS guardian_ids,
                COALESCE(lt.total_mad, 0) AS total_mad,
                COALESCE(pt.net_paid_mad, 0) AS net_paid_mad
         FROM invoices i
         LEFT JOIN students s ON s.id = i.student_id
         LEFT JOIN (
           SELECT invoice_id, SUM(amount_mad) AS total_mad
           FROM invoice_lines
           WHERE deleted_at IS NULL
           GROUP BY invoice_id
         ) lt ON lt.invoice_id = i.id
         LEFT JOIN (
           ${NET_PAID_BY_INVOICE_SQL}
         ) pt ON pt.invoice_id = i.id
         WHERE i.center_code = ? AND i.deleted_at IS NULL AND i.status = 'issued'
         ORDER BY i.month ASC`,
      )
      .all(centerCode) as OverdueInvoiceQueryRow[];

    if (rows.length === 0) return [];

    const groupIdsByStudent = this.listLiveGroupIdsByStudent(
      centerCode,
      rows.map((row) => row.student_id),
    );

    return rows.map((row) => ({
      invoiceId: row.invoice_id as InvoiceId,
      month: row.month,
      studentId: row.student_id as StudentId,
      studentName:
        row.student_name_fr === null || row.student_name_ar === null
          ? null
          : { fr: row.student_name_fr, ar: row.student_name_ar },
      guardianIds: parseGuardianIds(row.guardian_ids),
      groupIds: groupIdsByStudent.get(row.student_id) ?? [],
      totalMad: row.total_mad,
      netPaidMad: row.net_paid_mad,
    }));
  }

  /** Every live enrollment's group id, batched for `studentIds` in one `IN (...)`
   *  query (mirrors `SqliteEnrollmentRepository.countActiveByGroups`'s anti-N+1
   *  shape) — the groups a student currently attends, for the Impayés group filter. */
  private listLiveGroupIdsByStudent(
    centerCode: CenterCode,
    studentIds: readonly string[],
  ): Map<string, GroupId[]> {
    const groupIdsByStudent = new Map<string, GroupId[]>();
    const uniqueStudentIds = Array.from(new Set(studentIds));
    if (uniqueStudentIds.length === 0) return groupIdsByStudent;

    const placeholders = uniqueStudentIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT student_id, group_id FROM enrollments
         WHERE center_code = ? AND student_id IN (${placeholders}) AND deleted_at IS NULL`,
      )
      .all(centerCode, ...uniqueStudentIds) as { student_id: string; group_id: string }[];

    for (const row of rows) {
      const groupId = row.group_id as GroupId;
      const existing = groupIdsByStudent.get(row.student_id);
      if (existing) existing.push(groupId);
      else groupIdsByStudent.set(row.student_id, [groupId]);
    }
    return groupIdsByStudent;
  }
}
