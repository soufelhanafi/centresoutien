import type { BackupWorkbook } from '../../../src/backup/backup-workbook';
import type { BackupExcelPort } from '../../../src/ports/backup-excel-port';
import { BackupFileReadError } from '../../../src/errors/backup-errors';

/** In-memory {@link BackupExcelPort}: a Map of path → workbook. */
export class InMemoryBackupExcelPort implements BackupExcelPort {
  private readonly files = new Map<string, BackupWorkbook>();
  readError: Error | null = null;
  writeError: Error | null = null;

  has(path: string): boolean {
    return this.files.has(path);
  }

  async readWorkbook(path: string): Promise<BackupWorkbook> {
    if (this.readError !== null) throw this.readError;
    const workbook = this.files.get(path);
    if (workbook === undefined) {
      throw new BackupFileReadError(path, 'no such file');
    }
    return structuredClone(workbook);
  }

  async writeWorkbook(path: string, workbook: BackupWorkbook): Promise<void> {
    if (this.writeError !== null) throw this.writeError;
    this.files.set(path, structuredClone(workbook));
  }
}
