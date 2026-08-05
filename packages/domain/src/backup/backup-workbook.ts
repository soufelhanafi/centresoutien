/**
 * The Excel backup/restore workbook contract (SOU-44) — the public facade.
 *
 * The workbook is the portable, center-agnostic format: one sheet per entity
 * type, a header row of *domain* column names (not DB column names), and one row
 * per entity carrying the full sync-safe envelope. The domain owns this contract
 * (sheet names, column names, column types, import order) so a future web
 * restore flow reuses the same engine; the SQLite adapter in the data layer is
 * what translates domain columns to table columns.
 *
 * This file only re-exports: the types + envelope live in the dependency-free
 * leaf `backup-columns.ts`, and the sheet registry lives in
 * `backup-sheet-registry.ts` (+ its two halves). Keeping this file a pure
 * re-export facade is what keeps the module graph acyclic in the bundled app
 * (the QA boot-crash regression: a value-level cycle here throws a TDZ
 * ReferenceError in the packaged main process).
 */

export type {
  BackupCellValue,
  BackupRow,
  BackupSheet,
  BackupWorkbook,
  BackupColumnType,
  BackupColumn,
  BackupSheetSpec,
  BackupSheetName,
} from './backup-columns';
export { BACKUP_ENVELOPE_COLUMNS, NATURAL_KEY_COLUMN } from './backup-columns';
export { BACKUP_SHEETS, BACKUP_SHEET_NAMES, sheetColumnNames, findBackupSheet } from './backup-sheet-registry';
