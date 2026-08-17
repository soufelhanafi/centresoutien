/**
 * Dependency-free leaf of the backup workbook contract (SOU-44): the types and
 * the shared envelope/naturalKey column constants. Nothing in this file imports
 * another backup module, so the export bundle never forms a cycle here — the
 * sheet registry (backup-sheets-a/b) and the workbook facade (backup-workbook)
 * both depend on this leaf, never the other way around.
 *
 * Conventions (same as the workbook doc):
 * - `Date` fields travel as ISO-8601 strings; `null` stays `null`. Times of day
 *   are `'HH:mm'`, civil dates `'YYYY-MM-DD'`.
 * - id-array fields (`guardianIds`, `subjectIds`) travel comma-joined
 *   (`'stu_01HW…,stu_01HW…'`) — readable in Excel, unambiguous because ULIDs
 *   never contain commas. The data adapter translates to/from the DB's JSON
 *   array form.
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
  /**
   * Restore semantics: `upsert` rewrites the non-identity columns of an existing
   * id on apply; `skip` leaves an existing id untouched. `skip` is reserved for
   * tables whose rows must never be rewritten in place — `payments`
   * (append-only, UPDATE trigger) and `formulas` (immutable once billed). The
   * classifier mirrors it so the preview reports a replayed existing payment as
   * a duplicate (never `updated`), keeping preview and apply in lockstep.
   */
  restoreConflict: 'upsert' | 'skip';
  /** Domain columns, in workbook header order. */
  columns: readonly BackupColumn[];
};

/** The 20 entity sheets, in import dependency order. */
export type BackupSheetName =
  | 'parents'
  | 'students'
  | 'teachers'
  | 'rooms'
  | 'subjects'
  | 'niveaux'
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
  | 'holidays'
  | 'center-hours-overrides'
  | 'teacher-availability'
  | 'teacher-availability-exceptions';

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
