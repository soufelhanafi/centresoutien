import type { BackupWorkbook } from '../backup/backup-workbook';

/**
 * File I/O port for the Excel backup workbook (SOU-44). The domain never touches
 * the filesystem or exceljs — the desktop adapter (data layer) implements this
 * with exceljs, and a future web restore flow could implement it with a browser
 * workbook writer against the same contract.
 *
 * `readWorkbook` must surface a stable domain error ({@link BackupFileReadError})
 * when the file is missing, unreadable, or not a workbook the app wrote — never a
 * raw adapter exception.
 */
export interface BackupExcelPort {
  readWorkbook(path: string): Promise<BackupWorkbook>;
  writeWorkbook(path: string, workbook: BackupWorkbook): Promise<void>;
}
