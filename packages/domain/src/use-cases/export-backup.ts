import {
  BACKUP_SHEETS,
  sheetColumnNames,
  type BackupSheet,
} from '../backup/backup-workbook';
import type { BackupStore } from '../ports/backup-store';
import type { BackupExcelPort } from '../ports/backup-excel-port';
import { BackupFileWriteError } from '../errors/backup-errors';
import type { PlanPolicy } from '../plans/plan-policy';

export type ExportBackupInput = {
  filePath: string;
};

export type ExportBackupResult = {
  filePath: string;
  /** Rows written per sheet, keyed by sheet name. */
  counts: Record<string, number>;
};

/**
 * Data-level backup export (SOU-44) — distinct from the byte-level snapshot of
 * {@link CreateBackup} (SOU-102). Reads every entity of the active center from
 * the {@link BackupStore} (tombstones included, so the file is a full backup)
 * and writes one Excel workbook sheet per entity, carrying the full sync-safe
 * envelope. Gated on Pro+ `io.excel.export`.
 */
export class ExportBackup {
  constructor(
    private readonly store: BackupStore,
    private readonly excel: BackupExcelPort,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ExportBackupInput): Promise<ExportBackupResult> {
    this.plan.require('io.excel.export');

    const sheets: BackupSheet[] = [];
    const counts: Record<string, number> = {};
    for (const spec of BACKUP_SHEETS) {
      const rows = await this.store.readAllRows(spec.name);
      sheets.push({ name: spec.name, columns: sheetColumnNames(spec), rows });
      counts[spec.name] = rows.length;
    }

    try {
      await this.excel.writeWorkbook(input.filePath, { sheets });
    } catch (error) {
      if (error instanceof BackupFileWriteError) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      throw new BackupFileWriteError(input.filePath, detail);
    }

    return { filePath: input.filePath, counts };
  }
}
