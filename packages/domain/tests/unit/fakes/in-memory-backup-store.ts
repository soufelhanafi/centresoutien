import type { BackupRow, BackupSheetName } from '../../../src/backup/backup-workbook';
import type { BackupSheetWrite, BackupStore } from '../../../src/ports/backup-store';

/**
 * In-memory {@link BackupStore} for tests: upserts by id like the SQLite
 * adapter, exposes the raw rows for assertions, and can be told to throw so the
 * apply's transactional failure path is testable.
 */
export class InMemoryBackupStore implements BackupStore {
  readonly rows = new Map<BackupSheetName, Map<string, BackupRow>>();
  readonly applied: BackupSheetWrite[] = [];
  applyError: Error | null = null;

  seed(sheetName: BackupSheetName, rows: readonly BackupRow[]): void {
    const map = this.rows.get(sheetName) ?? new Map<string, BackupRow>();
    for (const row of rows) {
      const id = row['id'];
      if (typeof id === 'string') map.set(id, structuredClone(row));
    }
    this.rows.set(sheetName, map);
  }

  allRows(sheetName: BackupSheetName): readonly BackupRow[] {
    return [...(this.rows.get(sheetName)?.values() ?? [])].map((row) => structuredClone(row));
  }

  async readAllRows(sheetName: BackupSheetName): Promise<readonly BackupRow[]> {
    return this.allRows(sheetName);
  }

  async applyRows(sheets: readonly BackupSheetWrite[]): Promise<void> {
    this.applied.push(...sheets.map((sheet) => ({ sheetName: sheet.sheetName, rows: [...sheet.rows] })));
    if (this.applyError !== null) throw this.applyError;
    for (const sheet of sheets) {
      const map = this.rows.get(sheet.sheetName) ?? new Map<string, BackupRow>();
      for (const row of sheet.rows) {
        const id = row['id'];
        if (typeof id === 'string') map.set(id, structuredClone(row));
      }
      this.rows.set(sheet.sheetName, map);
    }
  }
}
