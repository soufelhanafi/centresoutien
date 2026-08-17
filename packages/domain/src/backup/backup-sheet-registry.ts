import type { BackupSheetName, BackupSheetSpec } from './backup-columns';
import { BACKUP_SHEETS_A } from './backup-sheets-a';
import { BACKUP_SHEETS_B } from './backup-sheets-b';

/**
 * The ordered sheet registry — the order IS the import dependency order
 * (parents before students before dependents), so apply can iterate it directly.
 * Split across two files only to respect the repo's file-size ceilings; the two
 * halves concatenate into one ordered array here.
 */
export const BACKUP_SHEET_NAMES: readonly BackupSheetName[] = [
  'parents',
  'students',
  'teachers',
  'rooms',
  'subjects',
  'niveaux',
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
];

export const BACKUP_SHEETS: readonly BackupSheetSpec[] = [...BACKUP_SHEETS_A, ...BACKUP_SHEETS_B];

/** Column names of a sheet's workbook columns, in header order. */
export function sheetColumnNames(spec: BackupSheetSpec): readonly string[] {
  return spec.columns.map((column) => column.name);
}

export function findBackupSheet(name: string): BackupSheetSpec | null {
  return BACKUP_SHEETS.find((sheet) => sheet.name === name) ?? null;
}
