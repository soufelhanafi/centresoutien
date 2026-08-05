import { findBackupSheet } from '../backup/backup-workbook';
import { classifyImportRow } from '../backup/classify-rows';
import {
  emptyImportCounts,
  type BackupImportPreview,
  type BackupImportRowReport,
} from '../backup/import-reports';
import { buildExistingIndex, readBackupWorkbook } from '../backup/import-context';
import type { BackupStore } from '../ports/backup-store';
import type { BackupExcelPort } from '../ports/backup-excel-port';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';

export type PreviewImportBackupInput = {
  filePath: string;
  centerCode: CenterCode;
};

/**
 * Dry-run of a backup import (SOU-44): parses the workbook, classifies every row
 * against the center's existing rows (`created` / `updated` / `duplicate` /
 * `invalid`), and returns a per-row report — it writes nothing. The renderer
 * shows this preview (created/updated counts, duplicates to review, per-row
 * errors) before the admin confirms the atomic apply. Gated on Pro+
 * `io.excel.import`.
 */
export class PreviewImportBackup {
  constructor(
    private readonly store: BackupStore,
    private readonly excel: BackupExcelPort,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: PreviewImportBackupInput): Promise<BackupImportPreview> {
    this.plan.require('io.excel.import');

    const workbook = await readBackupWorkbook(this.excel, input.filePath);
    const existing = await buildExistingIndex(this.store);

    const rows: BackupImportRowReport[] = [];
    const counts = emptyImportCounts();
    const unknownSheets: string[] = [];

    for (const sheet of workbook.sheets) {
      const spec = findBackupSheet(sheet.name);
      if (spec === null) {
        unknownSheets.push(sheet.name);
        continue;
      }
      const index = existing.get(spec.name);
      for (const [offset, row] of sheet.rows.entries()) {
        const classification = classifyImportRow({
          spec,
          row,
          existingIds: index?.ids ?? EMPTY_IDS,
          existingNaturalKeys: index?.naturalKeys ?? EMPTY_IDS,
          centerCode: input.centerCode,
        });
        counts[classification.status] += 1;
        rows.push({
          sheetName: spec.name,
          // Header is row 1, so the first data row is row 2 — matches Excel.
          rowNumber: offset + 2,
          status: classification.status,
          reason: classification.reason,
        });
      }
    }

    return {
      sheets: workbook.sheets.map((sheet) => sheet.name),
      unknownSheets,
      counts,
      rows,
    };
  }
}

const EMPTY_IDS: ReadonlySet<string> = new Set();
