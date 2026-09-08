import type { BackupSheetName } from '../backup/backup-workbook';
import { resolveWorkbookReferences } from '../backup/resolve-references';
import {
  emptyImportCounts,
  type BackupImportPreview,
  type BackupImportRowReport,
} from '../backup/import-reports';
import { buildExistingIndex, classifyWorkbook, readBackupWorkbook } from '../backup/import-context';
import type { BackupStore } from '../ports/backup-store';
import type { BackupExcelPort } from '../ports/backup-excel-port';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';

export type PreviewImportBackupInput = {
  filePath: string;
  centerCode: CenterCode;
};

/**
 * Dry-run of a backup import (SOU-44): parses the workbook, classifies every
 * row against the center's existing rows (`created` / `updated` / `duplicate` /
 * `invalid`), then repairs dangling references the same way `ApplyImportBackup`
 * will (SOU-317: a missing catalog id gets a placeholder row reported as an
 * extra `created` entry; a missing financial/scheduling link either drops the
 * field or forces the row `invalid`) — so the preview never promises something
 * the apply won't actually do. It writes nothing. The renderer shows this
 * preview (created/updated counts, duplicates to review, per-row errors)
 * before the admin confirms the atomic apply. Gated on Pro+ `io.excel.import`.
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
    const { classifiedBySheet, knownIdsBySheet } = classifyWorkbook(workbook, existing, input.centerCode);
    const { placeholders, outcomesBySheet } = resolveWorkbookReferences(classifiedBySheet, knownIdsBySheet);

    const rows: BackupImportRowReport[] = [];
    const counts = emptyImportCounts();
    const unknownSheets: string[] = [];

    for (const sheet of workbook.sheets) {
      const classified = classifiedBySheet.get(sheet.name as BackupSheetName);
      if (classified === undefined) {
        unknownSheets.push(sheet.name);
        continue;
      }
      const outcomes = outcomesBySheet.get(sheet.name as BackupSheetName) ?? [];
      for (const [offset, entry] of classified.entries()) {
        const outcome = outcomes[offset];
        const broken = outcome?.brokenLinkReason ?? null;
        const status = broken !== null ? 'invalid' : entry.status;
        const reason =
          broken ?? (outcome !== undefined && outcome.droppedLinkReasons.length > 0
            ? outcome.droppedLinkReasons.join(';')
            : entry.reason);
        counts[status] += 1;
        rows.push({
          sheetName: sheet.name,
          // Header is row 1, so the first data row is row 2 — matches Excel.
          rowNumber: offset + 2,
          status,
          reason,
        });
      }
    }

    // Not real workbook rows — synthesized to repair a dangling reference.
    // Every placeholder gets its own negative `rowNumber`: a real row is
    // always >= 2 (header is row 1), so this can never collide with one, and
    // giving each placeholder a distinct number (rather than a shared `0`)
    // keeps `${sheetName}-${rowNumber}` unique for the renderer's row list
    // key even when a single sheet gets more than one placeholder.
    placeholders.forEach((placeholder, index) => {
      counts.created += 1;
      rows.push({
        sheetName: placeholder.sheet,
        rowNumber: -1 - index,
        status: 'created',
        reason: 'auto-created-placeholder',
      });
    });

    return {
      sheets: workbook.sheets.map((sheet) => sheet.name),
      unknownSheets,
      counts,
      rows,
    };
  }
}
