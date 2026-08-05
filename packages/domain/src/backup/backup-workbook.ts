/**
 * The Excel backup/restore workbook contract (SOU-44).
 *
 * The workbook is the portable, center-agnostic format: one sheet per entity
 * type, a header row of *domain* column names (not DB column names), and one row
 * per entity carrying the full sync-safe envelope. The domain owns this contract
 * (sheet names, column names, column types, import order) so a future web
 * restore flow reuses the same engine; the SQLite adapter in the data layer is
 * what translates domain columns to table columns.
 *
 * Conventions:
 * - `Date` fields travel as ISO-8601 strings (the Clock port's canonical form);
 *   `null` stays `null`. Times of day are `'HH:mm'`, civil dates `'YYYY-MM-DD'`.
 * - id-array fields (`guardianIds`, `subjectIds`) travel as a comma-joined
 *   string (`'stu_01HW…,stu_01HW…'`) — readable in Excel, unambiguous because
 *   ULIDs never contain commas. The data adapter translates to/from the DB's
 *   JSON array form.
 * - `id` and `naturalKey` are the only optional columns on import: a people-like
 *   row without an `id` is created fresh (new ULID + envelope) at apply time,
 *   and `naturalKey` is the duplicate-match key. Every other column is required.
 *
 * The registry (sheet names, specs, helpers) lives in `backup-sheet-registry.ts`
 * and is re-exported here so every consumer imports one module.
 */

export type BackupCellValue = string | number | boolean | null;

export type BackupRow = Record<string, BackupCellValue>;

export type BackupSheet = {
  name: string;
  columns: readonly string[];
  rows: readonly BackupRow[];
};

export type BackupWorkbook = {
  sheets: readonly BackupSheet[];
};

export type BackupColumnType = 'string' | 'string-or-null' | 'number' | 'boolean';

export type BackupColumn = {
  name: string;
  type: BackupColumnType;
  /**
   * Column may be absent on import. Only `id` (fresh-ULID creation), the
   * mintable envelope fields, and `naturalKey` (people-like duplicate matching)
   * are ever optional — all are always present on export.
   */
  optional?: boolean;
};

export type BackupSheetSpec = {
  name: BackupSheetName;
  /** The ULID id prefix (`'stu'`, `'prt'`, …) this sheet's rows must carry. */
  idPrefix: string;
  /** People-like sheets match duplicates by `naturalKey` (parents-first anchor). */
  peopleLike: boolean;
  /** Column name carrying the natural key; set exactly when `peopleLike`. */
  naturalKeyColumn: string | null;
  /** Domain columns, in workbook header order. */
  columns: readonly BackupColumn[];
};

/**
 * The shared envelope columns. `id` and every envelope column except
 * `centerCode` is optional on import: an id-less people-like row is created
 * fresh (the apply mints the whole envelope), while an id-carrying row must
 * bring its envelope (see {@link classifyImportRow}'s `incomplete-envelope`
 * check). `centerCode` is always required — it is the tenant marker.
 */
export const BACKUP_ENVELOPE_COLUMNS: readonly BackupColumn[] = [
  { name: 'id', type: 'string', optional: true },
  { name: 'centerCode', type: 'string' },
  { name: 'deviceOrigin', type: 'string', optional: true },
  { name: 'createdAt', type: 'string', optional: true },
  { name: 'updatedAt', type: 'string', optional: true },
  { name: 'updatedBy', type: 'string', optional: true },
  { name: 'deletedAt', type: 'string-or-null', optional: true },
  { name: 'version', type: 'number', optional: true },
];

/** The optional `naturalKey` column shared by the people-like sheets. */
export const NATURAL_KEY_COLUMN: BackupColumn = { name: 'naturalKey', type: 'string', optional: true };

/** The 16 entity sheets, in import dependency order. */
export type BackupSheetName =
  | 'parents'
  | 'students'
  | 'teachers'
  | 'rooms'
  | 'subjects'
  | 'groups'
  | 'formulas'
  | 'student-subscriptions'
  | 'enrollments'
  | 'weekly-recurring-sessions'
  | 'sessions'
  | 'invoices'
  | 'invoice-lines'
  | 'payments'
  | 'center-hours'
  | 'holidays';

export { BACKUP_SHEETS, BACKUP_SHEET_NAMES, sheetColumnNames, findBackupSheet } from './backup-sheet-registry';