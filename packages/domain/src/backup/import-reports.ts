import type { ImportRowStatus } from './classify-rows';

/** Per-status tallies of an import preview/apply run. */
export type BackupImportCounts = {
  created: number;
  updated: number;
  duplicate: number;
  invalid: number;
};

/** One workbook row's verdict — `rowNumber` is 1-based including the header row,
 *  so it matches what the user sees in Excel (row 2 is the first data row). */
export type BackupImportRowReport = {
  sheetName: string;
  rowNumber: number;
  status: ImportRowStatus;
  reason: string | null;
};

/** The dry-run result shown before apply. */
export type BackupImportPreview = {
  sheets: readonly string[];
  /** Sheet names in the file that this app does not know — skipped, never fatal. */
  unknownSheets: readonly string[];
  counts: BackupImportCounts;
  rows: readonly BackupImportRowReport[];
};

/** The result of an atomic apply. `counts.created/updated` were written;
 *  `counts.duplicate/invalid` were skipped. */
export type BackupImportApplyResult = {
  counts: BackupImportCounts;
  totalRows: number;
};

export function emptyImportCounts(): BackupImportCounts {
  return { created: 0, updated: 0, duplicate: 0, invalid: 0 };
}
