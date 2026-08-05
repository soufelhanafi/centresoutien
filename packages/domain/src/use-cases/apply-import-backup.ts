import {
  BACKUP_SHEETS,
  type BackupRow,
  type BackupSheetSpec,
} from '../backup/backup-workbook';
import { classifyImportRow } from '../backup/classify-rows';
import { emptyImportCounts, type BackupImportApplyResult } from '../backup/import-reports';
import { buildExistingIndex, readBackupWorkbook } from '../backup/import-context';
import type { BackupStore, BackupSheetWrite } from '../ports/backup-store';
import type { BackupExcelPort } from '../ports/backup-excel-port';
import type { IdGenerator } from '../ports/id-generator';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { BackupImportApplyError } from '../errors/backup-errors';

export type ApplyImportBackupInput = {
  filePath: string;
  centerCode: CenterCode;
};

/**
 * Atomic backup restore (SOU-44): re-parses the workbook, re-classifies every
 * row (same rules as {@link PreviewImportBackup}), and applies the `created` +
 * `updated` rows in the registry's dependency order in **one transaction** —
 * any failure rolls the whole import back. Duplicates and invalid rows are
 * skipped (they are never silently merged or repaired by a backup restore; the
 * sync engine owns merging). A people-like row without an `id` is created fresh
 * with a new ULID + envelope. Gated on Pro+ `io.excel.import`.
 */
export class ApplyImportBackup {
  constructor(
    private readonly store: BackupStore,
    private readonly excel: BackupExcelPort,
    private readonly plan: PlanPolicy,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly deviceOrigin: DeviceId,
    private readonly updatedBy: UserId,
  ) {}

  async execute(input: ApplyImportBackupInput): Promise<BackupImportApplyResult> {
    this.plan.require('io.excel.import');

    const workbook = await readBackupWorkbook(this.excel, input.filePath);
    const existing = await buildExistingIndex(this.store);
    const byName = new Map(workbook.sheets.map((sheet) => [sheet.name, sheet]));

    const counts = emptyImportCounts();
    const sheetsToApply: BackupSheetWrite[] = [];
    let totalRows = 0;

    for (const spec of BACKUP_SHEETS) {
      const sheet = byName.get(spec.name);
      if (sheet === undefined) continue;

      const index = existing.get(spec.name);
      const rowsToApply: BackupRow[] = [];

      for (const row of sheet.rows) {
        totalRows += 1;
        const classification = classifyImportRow({
          spec,
          row,
          existingIds: index?.ids ?? EMPTY_IDS,
          existingNaturalKeys: index?.naturalKeys ?? EMPTY_IDS,
          centerCode: input.centerCode,
        });
        counts[classification.status] += 1;

        if (classification.status === 'created') {
          rowsToApply.push(this.mintCreatedRow(spec, row, input.centerCode));
        } else if (classification.status === 'updated') {
          rowsToApply.push(row);
        }
      }

      if (rowsToApply.length > 0) {
        sheetsToApply.push({ sheetName: spec.name, rows: rowsToApply });
      }
    }

    if (sheetsToApply.length > 0) {
      try {
        await this.store.applyRows(sheetsToApply);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new BackupImportApplyError('*', 0, detail);
      }
    }

    return { counts, totalRows };
  }

  /** Give an id-less people-like row a fresh ULID + envelope; other created rows
   *  already carry their full backup envelope and are applied as-is. */
  private mintCreatedRow(spec: BackupSheetSpec, row: BackupRow, centerCode: CenterCode): BackupRow {
    if (row['id'] !== null && row['id'] !== undefined) return row;
    const now = this.clock.now().toISOString();
    return {
      ...row,
      id: this.ids.next(spec.idPrefix),
      centerCode,
      deviceOrigin: this.deviceOrigin,
      createdAt: now,
      updatedAt: now,
      updatedBy: this.updatedBy,
      deletedAt: null,
      version: 0,
    };
  }
}

const EMPTY_IDS: ReadonlySet<string> = new Set();
