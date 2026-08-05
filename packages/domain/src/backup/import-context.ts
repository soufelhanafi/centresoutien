import { BACKUP_SHEETS, type BackupSheetName, type BackupWorkbook } from './backup-workbook';
import type { BackupExcelPort } from '../ports/backup-excel-port';
import type { BackupStore } from '../ports/backup-store';
import { BackupFileReadError } from '../errors/backup-errors';

/** Existing rows of one sheet, indexed for import classification. */
export type ExistingSheetIndex = {
  ids: ReadonlySet<string>;
  /** naturalKeys of live (non-tombstoned) rows only — a tombstone must not
   *  block recreating the same person. */
  naturalKeys: ReadonlySet<string>;
};

/**
 * Read every sheet's existing rows once and index them by id + live naturalKey,
 * so preview and apply classify every workbook row against a single snapshot of
 * the DB (KICKOFF: preview and apply can never disagree).
 */
export async function buildExistingIndex(store: BackupStore): Promise<Map<BackupSheetName, ExistingSheetIndex>> {
  const index = new Map<BackupSheetName, ExistingSheetIndex>();
  for (const spec of BACKUP_SHEETS) {
    const rows = await store.readAllRows(spec.name);
    const ids = new Set<string>();
    const naturalKeys = new Set<string>();
    for (const row of rows) {
      if (typeof row['id'] === 'string' && row['id'].length > 0) ids.add(row['id']);
      const naturalKeyColumn = spec.naturalKeyColumn ?? 'naturalKey';
      const naturalKey = row[naturalKeyColumn];
      if (typeof naturalKey === 'string' && naturalKey.length > 0 && row['deletedAt'] === null) {
        naturalKeys.add(naturalKey);
      }
    }
    index.set(spec.name, { ids, naturalKeys });
  }
  return index;
}

/** Read a workbook, wrapping adapter failures in the stable domain error. */
export async function readBackupWorkbook(
  excel: BackupExcelPort,
  path: string,
): Promise<BackupWorkbook> {
  try {
    return await excel.readWorkbook(path);
  } catch (error) {
    if (error instanceof BackupFileReadError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new BackupFileReadError(path, detail);
  }
}
