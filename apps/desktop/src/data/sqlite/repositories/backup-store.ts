import type { Database as DB } from 'better-sqlite3';
import type {
  BackupCellValue,
  BackupRow,
  BackupSheetName,
  BackupSheetWrite,
  BackupStore,
} from '@centresoutien/domain';

/** Domain column name → table column name, plus per-sheet write behavior. */
type SheetSqlConfig = {
  table: string;
  columns: readonly (readonly [domainColumn: string, sqlColumn: string])[];
  /**
   * `upsert` rewrites the non-identity columns on an existing id; `skip` leaves
   * an existing id untouched (INSERT … ON CONFLICT DO NOTHING). `skip` is
   * reserved for tables whose rows must never be rewritten in place: `payments`
   * (append-only UPDATE trigger) and `formulas` (immutable-once-billed UPDATE
   * guard).
   */
  conflict: 'upsert' | 'skip';
};

const ENVELOPE_COLUMNS: readonly (readonly [string, string])[] = [
  ['id', 'id'],
  ['centerCode', 'center_code'],
  ['deviceOrigin', 'device_origin'],
  ['createdAt', 'created_at'],
  ['updatedAt', 'updated_at'],
  ['updatedBy', 'updated_by'],
  ['deletedAt', 'deleted_at'],
  ['version', 'version'],
];

/** Domain columns whose value is a 0/1 SQLite integer. */
const BOOLEAN_COLUMNS = new Set(['whatsappOptIn', 'active', 'isImmutable']);

/** Domain columns stored as a JSON array string in SQLite, comma-joined in the
 *  workbook (ULIDs contain no commas, so the join is unambiguous). */
const JSON_ID_COLUMNS = new Set(['guardianIds', 'subjectIds']);

/** Columns never rewritten on an upsert conflict — identity, not state. */
const IDENTITY_COLUMNS = new Set(['id', 'center_code', 'device_origin', 'created_at']);

const SHEET_SQL: Record<BackupSheetName, SheetSqlConfig> = {
  parents: {
    table: 'parents',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['naturalKey', 'natural_key'],
      ['name', 'name'],
      ['phone', 'phone'],
      ['email', 'email'],
      ['relation', 'relation'],
      ['whatsappOptIn', 'whatsapp_opt_in'],
    ],
  },
  students: {
    table: 'students',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['naturalKey', 'natural_key'],
      ['name_fr', 'name_fr'],
      ['name_ar', 'name_ar'],
      ['birthDate', 'birth_date'],
      ['level', 'level'],
      ['school', 'school'],
      ['notes', 'notes'],
      ['guardianIds', 'guardian_ids'],
    ],
  },
  teachers: {
    table: 'teachers',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['naturalKey', 'natural_key'],
      ['name_fr', 'name_fr'],
      ['name_ar', 'name_ar'],
      ['cin', 'cin'],
      ['phone', 'phone'],
      ['email', 'email'],
      ['subjectIds', 'subject_ids'],
      ['active', 'active'],
    ],
  },
  rooms: {
    table: 'rooms',
    conflict: 'upsert',
    columns: [...ENVELOPE_COLUMNS, ['name', 'name'], ['capacity', 'capacity'], ['active', 'active']],
  },
  subjects: {
    table: 'subjects',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['name_fr', 'name_fr'],
      ['name_ar', 'name_ar'],
      ['code', 'code'],
      ['active', 'active'],
    ],
  },
  groups: {
    table: 'groups',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['subjectId', 'subject_id'],
      ['teacherId', 'teacher_id'],
      ['roomId', 'room_id'],
      ['level', 'level'],
      ['capacity', 'capacity'],
      ['kind', 'kind'],
      ['active', 'active'],
    ],
  },
  formulas: {
    table: 'formulas',
    conflict: 'skip',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['name_fr', 'name_fr'],
      ['name_ar', 'name_ar'],
      ['subjectIds', 'subject_ids'],
      ['priceMad', 'price_mad'],
      ['kind', 'kind'],
      ['isImmutable', 'is_immutable'],
      ['active', 'active'],
    ],
  },
  'student-subscriptions': {
    table: 'student_subscriptions',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['studentId', 'student_id'],
      ['formulaId', 'formula_id'],
      ['kind', 'kind'],
      ['subjectIds', 'subject_ids'],
      ['startMonth', 'start_month'],
      ['endMonth', 'end_month'],
    ],
  },
  enrollments: {
    table: 'enrollments',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['studentId', 'student_id'],
      ['groupId', 'group_id'],
      ['startMonth', 'start_month'],
      ['endMonth', 'end_month'],
    ],
  },
  'weekly-recurring-sessions': {
    table: 'weekly_recurring_sessions',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['roomId', 'room_id'],
      ['teacherId', 'teacher_id'],
      ['groupId', 'group_id'],
      ['dayOfWeek', 'day_of_week'],
      ['start', 'start_time'],
      ['end', 'end_time'],
      ['active', 'active'],
      ['validFrom', 'valid_from'],
      ['validTo', 'valid_to'],
    ],
  },
  sessions: {
    table: 'sessions',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['recurringSessionId', 'recurring_session_id'],
      ['generationBatchId', 'generation_batch_id'],
      ['roomId', 'room_id'],
      ['teacherId', 'teacher_id'],
      ['groupId', 'group_id'],
      ['date', 'date'],
      ['start', 'start_time'],
      ['end', 'end_time'],
    ],
  },
  invoices: {
    table: 'invoices',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['studentId', 'student_id'],
      ['month', 'month'],
      ['status', 'status'],
      ['issuedAt', 'issued_at'],
      ['cancelledAt', 'cancelled_at'],
    ],
  },
  'invoice-lines': {
    table: 'invoice_lines',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['invoiceId', 'invoice_id'],
      ['formulaId', 'formula_id'],
      ['label_fr', 'label_fr'],
      ['label_ar', 'label_ar'],
      ['kind', 'kind'],
      ['amountMad', 'amount_mad'],
    ],
  },
  payments: {
    table: 'payments',
    conflict: 'skip',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['invoiceId', 'invoice_id'],
      ['kind', 'kind'],
      ['amountMad', 'amount_mad'],
      ['method', 'method'],
      ['paidOn', 'paid_on'],
      ['reversesPaymentId', 'reverses_payment_id'],
      ['note', 'note'],
    ],
  },
  'center-hours': {
    table: 'center_hours',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['dayOfWeek', 'day_of_week'],
      ['open', 'open'],
      ['close', 'close'],
    ],
  },
  holidays: {
    table: 'holidays',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['name_fr', 'name_fr'],
      ['name_ar', 'name_ar'],
      ['kind', 'kind'],
      ['startDate', 'start_date'],
      ['endDate', 'end_date'],
    ],
  },
};

function toSqlValue(domainColumn: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (BOOLEAN_COLUMNS.has(domainColumn)) return value === true || value === 1 ? 1 : 0;
  if (JSON_ID_COLUMNS.has(domainColumn)) {
    if (typeof value !== 'string' || value.length === 0) return '[]';
    return JSON.stringify(value.split(','));
  }
  return value;
}

function fromSqlValue(domainColumn: string, value: unknown): BackupCellValue {
  if (value === null || value === undefined) return null;
  if (BOOLEAN_COLUMNS.has(domainColumn)) return value !== 0 && value !== '0' && value !== false;
  if (JSON_ID_COLUMNS.has(domainColumn)) {
    if (typeof value !== 'string' || value.length === 0) return '';
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.join(',') : '';
    } catch {
      return '';
    }
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return null;
}

/**
 * SQLite adapter for {@link BackupStore} (SOU-44): pure translation between the
 * domain's workbook rows and the per-center SQLCipher tables. Reads are scoped
 * to the active center and include tombstones (full backup). Writes run across
 * all sheets in one transaction — a single failing row aborts and rolls back the
 * whole import. Table and column names are hard-coded (never interpolated from
 * the workbook); the only runtime inputs are bound as parameters.
 */
export class SqliteBackupStore implements BackupStore {
  constructor(
    private readonly db: DB,
    private readonly centerCode: string,
  ) {}

  async readAllRows(sheetName: BackupSheetName): Promise<readonly BackupRow[]> {
    const config = SHEET_SQL[sheetName];
    const sqlColumns = config.columns.map(([, sql]) => sql).join(', ');
    const rows = this.db
      .prepare(`SELECT ${sqlColumns} FROM ${config.table} WHERE center_code = ? ORDER BY rowid`)
      .all(this.centerCode) as Record<string, unknown>[];

    return rows.map((row) => {
      const backupRow: BackupRow = {};
      for (const [domainColumn, sqlColumn] of config.columns) {
        backupRow[domainColumn] = fromSqlValue(domainColumn, row[sqlColumn]);
      }
      return backupRow;
    });
  }

  async applyRows(sheets: readonly BackupSheetWrite[]): Promise<void> {
    const run = this.db.transaction((writes: readonly BackupSheetWrite[]) => {
      for (const sheet of writes) {
        const config = SHEET_SQL[sheet.sheetName];
        for (const row of sheet.rows) {
          this.upsertRow(config, row);
        }
      }
    });
    run(sheets);
  }

  private upsertRow(config: SheetSqlConfig, row: BackupRow): void {
    const present = config.columns.filter(([domainColumn]) => row[domainColumn] !== undefined);
    const sqlColumns = present.map(([, sql]) => sql);
    if (sqlColumns.length === 0) return;

    const params: Record<string, unknown> = {};
    for (const [domainColumn, sqlColumn] of present) {
      params[sqlColumn] = toSqlValue(domainColumn, row[domainColumn]);
    }

    const placeholders = sqlColumns.map((column) => `@${column}`).join(', ');
    const insert = `INSERT INTO ${config.table} (${sqlColumns.join(', ')}) VALUES (${placeholders})`;

    if (config.conflict === 'skip') {
      this.db.prepare(`${insert} ON CONFLICT(id) DO NOTHING`).run(params);
      return;
    }

    const updateColumns = sqlColumns.filter((column) => !IDENTITY_COLUMNS.has(column));
    if (updateColumns.length === 0) {
      this.db.prepare(`${insert} ON CONFLICT(id) DO NOTHING`).run(params);
      return;
    }
    const setClause = updateColumns.map((column) => `${column} = excluded.${column}`).join(', ');
    this.db
      .prepare(`${insert} ON CONFLICT(id) DO UPDATE SET ${setClause}`)
      .run(params);
  }
}
