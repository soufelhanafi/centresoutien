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
   * Column may be absent on import. Only `id` (fresh-ULID creation) and
   * `naturalKey` (people-like duplicate matching) are ever optional — both are
   * always present on export.
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

export const BACKUP_ENVELOPE_COLUMNS: readonly BackupColumn[] = [
  { name: 'id', type: 'string', optional: true },
  { name: 'centerCode', type: 'string' },
  { name: 'deviceOrigin', type: 'string' },
  { name: 'createdAt', type: 'string' },
  { name: 'updatedAt', type: 'string' },
  { name: 'updatedBy', type: 'string' },
  { name: 'deletedAt', type: 'string-or-null' },
  { name: 'version', type: 'number' },
];

const NATURAL_KEY_COLUMN: BackupColumn = { name: 'naturalKey', type: 'string', optional: true };

/**
 * The ordered sheet registry — the order is the import dependency order
 * (parents before students before dependents), so apply can iterate it directly.
 */
export const BACKUP_SHEET_NAMES = [
  'parents',
  'students',
  'teachers',
  'rooms',
  'subjects',
  'groups',
  'formulas',
  'student-subscriptions',
  'enrollments',
  'weekly-recurring-sessions',
  'sessions',
  'invoices',
  'invoice-lines',
  'payments',
  'center-hours',
  'holidays',
] as const;

export type BackupSheetName = (typeof BACKUP_SHEET_NAMES)[number];

export const BACKUP_SHEETS: readonly BackupSheetSpec[] = [
  {
    name: 'parents',
    idPrefix: 'prt',
    peopleLike: true,
    naturalKeyColumn: 'naturalKey',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      NATURAL_KEY_COLUMN,
      { name: 'name', type: 'string' },
      { name: 'phone', type: 'string' },
      { name: 'email', type: 'string-or-null' },
      { name: 'relation', type: 'string' },
      { name: 'whatsappOptIn', type: 'boolean' },
    ],
  },
  {
    name: 'students',
    idPrefix: 'stu',
    peopleLike: true,
    naturalKeyColumn: 'naturalKey',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      NATURAL_KEY_COLUMN,
      { name: 'name_fr', type: 'string' },
      { name: 'name_ar', type: 'string' },
      { name: 'birthDate', type: 'string' },
      { name: 'level', type: 'string' },
      { name: 'school', type: 'string-or-null' },
      { name: 'notes', type: 'string-or-null' },
      { name: 'guardianIds', type: 'string' },
    ],
  },
  {
    name: 'teachers',
    idPrefix: 'tch',
    peopleLike: true,
    naturalKeyColumn: 'naturalKey',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      NATURAL_KEY_COLUMN,
      { name: 'name_fr', type: 'string' },
      { name: 'name_ar', type: 'string' },
      { name: 'cin', type: 'string-or-null' },
      { name: 'phone', type: 'string' },
      { name: 'email', type: 'string-or-null' },
      { name: 'subjectIds', type: 'string' },
      { name: 'active', type: 'boolean' },
    ],
  },
  {
    name: 'rooms',
    idPrefix: 'rom',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      { name: 'name', type: 'string' },
      { name: 'capacity', type: 'number' },
      { name: 'active', type: 'boolean' },
    ],
  },
  {
    name: 'subjects',
    idPrefix: 'sub',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      { name: 'name_fr', type: 'string' },
      { name: 'name_ar', type: 'string' },
      { name: 'code', type: 'string-or-null' },
      { name: 'active', type: 'boolean' },
    ],
  },
  {
    name: 'groups',
    idPrefix: 'grp',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      { name: 'subjectId', type: 'string' },
      { name: 'teacherId', type: 'string-or-null' },
      { name: 'roomId', type: 'string' },
      { name: 'level', type: 'string' },
      { name: 'capacity', type: 'number' },
      { name: 'kind', type: 'string' },
      { name: 'active', type: 'boolean' },
    ],
  },
  {
    name: 'formulas',
    idPrefix: 'fml',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      { name: 'name_fr', type: 'string' },
      { name: 'name_ar', type: 'string' },
      { name: 'subjectIds', type: 'string' },
      { name: 'priceMad', type: 'number' },
      { name: 'kind', type: 'string' },
      { name: 'isImmutable', type: 'boolean' },
      { name: 'active', type: 'boolean' },
    ],
  },
  {
    name: 'student-subscriptions',
    idPrefix: 'sbs',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      { name: 'studentId', type: 'string' },
      { name: 'formulaId', type: 'string' },
      { name: 'kind', type: 'string' },
      { name: 'subjectIds', type: 'string' },
      { name: 'startMonth', type: 'string' },
      { name: 'endMonth', type: 'string-or-null' },
    ],
  },
  {
    name: 'enrollments',
    idPrefix: 'enr',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      { name: 'studentId', type: 'string' },
      { name: 'groupId', type: 'string' },
      { name: 'startMonth', type: 'string' },
      { name: 'endMonth', type: 'string-or-null' },
    ],
  },
  {
    name: 'weekly-recurring-sessions',
    idPrefix: 'wrs',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      { name: 'roomId', type: 'string' },
      { name: 'teacherId', type: 'string-or-null' },
      { name: 'groupId', type: 'string-or-null' },
      { name: 'dayOfWeek', type: 'number' },
      { name: 'start', type: 'string' },
      { name: 'end', type: 'string' },
      { name: 'active', type: 'boolean' },
      { name: 'validFrom', type: 'string-or-null' },
      { name: 'validTo', type: 'string-or-null' },
    ],
  },
  {
    name: 'sessions',
    idPrefix: 'ses',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      { name: 'recurringSessionId', type: 'string' },
      { name: 'generationBatchId', type: 'string-or-null' },
      { name: 'roomId', type: 'string' },
      { name: 'teacherId', type: 'string-or-null' },
      { name: 'groupId', type: 'string-or-null' },
      { name: 'date', type: 'string' },
      { name: 'start', type: 'string' },
      { name: 'end', type: 'string' },
    ],
  },
  {
    name: 'invoices',
    idPrefix: 'inv',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      { name: 'studentId', type: 'string' },
      { name: 'month', type: 'string' },
      { name: 'status', type: 'string' },
      { name: 'issuedAt', type: 'string-or-null' },
      { name: 'cancelledAt', type: 'string-or-null' },
    ],
  },
  {
    name: 'invoice-lines',
    idPrefix: 'invl',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      { name: 'invoiceId', type: 'string' },
      { name: 'formulaId', type: 'string' },
      { name: 'label_fr', type: 'string' },
      { name: 'label_ar', type: 'string' },
      { name: 'kind', type: 'string' },
      { name: 'amountMad', type: 'number' },
    ],
  },
  {
    name: 'payments',
    idPrefix: 'pay',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      { name: 'invoiceId', type: 'string' },
      { name: 'kind', type: 'string' },
      { name: 'amountMad', type: 'number' },
      { name: 'method', type: 'string' },
      { name: 'paidOn', type: 'string' },
      { name: 'reversesPaymentId', type: 'string-or-null' },
      { name: 'note', type: 'string-or-null' },
    ],
  },
  {
    name: 'center-hours',
    idPrefix: 'chr',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      { name: 'dayOfWeek', type: 'number' },
      { name: 'open', type: 'string-or-null' },
      { name: 'close', type: 'string-or-null' },
    ],
  },
  {
    name: 'holidays',
    idPrefix: 'hol',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      { name: 'name_fr', type: 'string' },
      { name: 'name_ar', type: 'string' },
      { name: 'kind', type: 'string' },
      { name: 'startDate', type: 'string' },
      { name: 'endDate', type: 'string' },
    ],
  },
];

/** Column names of a sheet's workbook columns, in header order. */
export function sheetColumnNames(spec: BackupSheetSpec): readonly string[] {
  return spec.columns.map((column) => column.name);
}

export function findBackupSheet(name: string): BackupSheetSpec | null {
  return BACKUP_SHEETS.find((sheet) => sheet.name === name) ?? null;
}
