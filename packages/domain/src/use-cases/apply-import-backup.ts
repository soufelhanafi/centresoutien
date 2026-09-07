import { BACKUP_SHEETS, type BackupRow, type BackupSheetSpec } from '../backup/backup-workbook';
import { resolveWorkbookReferences } from '../backup/resolve-references';
import { buildPlaceholderRow } from '../backup/placeholder-rows';
import { emptyImportCounts, type BackupImportApplyResult } from '../backup/import-reports';
import { buildExistingIndex, classifyWorkbook, readBackupWorkbook } from '../backup/import-context';
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
 * row (same rules as {@link PreviewImportBackup}), repairs dangling references
 * the same way the preview reported them (SOU-317: a missing catalog id gets a
 * minimal placeholder row so the reference resolves; a missing financial/
 * scheduling link is dropped when nullable or forces the row `invalid`
 * otherwise — never fabricated), and applies everything in the registry's
 * dependency order in **one transaction** — any failure rolls the whole
 * import back. Duplicates and invalid rows are skipped (they are never
 * silently merged or repaired beyond reference resolution; the sync engine
 * owns merging). A people-like row without an `id` is created fresh with a
 * new ULID + envelope. Gated on Pro+ `io.excel.import`.
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
    const { classifiedBySheet, knownIdsBySheet } = classifyWorkbook(workbook, existing, input.centerCode);
    const { placeholders, outcomesBySheet } = resolveWorkbookReferences(classifiedBySheet, knownIdsBySheet);

    const counts = emptyImportCounts();
    const sheetsToApply: BackupSheetWrite[] = [];
    let totalRows = 0;
    const now = this.clock.now().toISOString();

    for (const spec of BACKUP_SHEETS) {
      const classified = classifiedBySheet.get(spec.name);
      const rowsToApply: BackupRow[] = [];

      // A sheet's own rows only exist when the workbook carries that sheet —
      // but a placeholder can still target it below even when it doesn't
      // (an older or partial export can omit a sheet entirely).
      if (classified !== undefined) {
        totalRows += classified.length;
        const outcomes = outcomesBySheet.get(spec.name) ?? [];
        for (const [offset, entry] of classified.entries()) {
          const outcome = outcomes[offset];
          if (outcome?.brokenLinkReason != null) {
            counts.invalid += 1;
            continue;
          }
          counts[entry.status] += 1;
          if (entry.status === 'created' || entry.status === 'updated') {
            const sourceRow = outcome?.row ?? entry.row;
            rowsToApply.push(this.prepareRow(spec, sourceRow, input.centerCode));
          }
        }
      }

      for (const placeholder of placeholders) {
        if (placeholder.sheet !== spec.name) continue;
        rowsToApply.push(
          buildPlaceholderRow(spec, placeholder.id, input.centerCode, now, this.deviceOrigin, this.updatedBy),
        );
        counts.created += 1;
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

  /**
   * Every applied row is stamped as an edit *now* (updatedAt / updatedBy), for
   * both created-with-id and updated rows — a restore is a real modification by
   * the current user, and stamping keeps it visible to the sync change feed
   * (`updated_at > cursor`) so other laptops of a multi-device center converge
   * after a restore instead of silently keeping their pre-restore state.
   * `createdAt` stays historical; id-less people rows additionally get a fresh
   * ULID + the minted envelope.
   */
  private prepareRow(spec: BackupSheetSpec, row: BackupRow, centerCode: CenterCode): BackupRow {
    const now = this.clock.now().toISOString();
    if (row['id'] !== null && row['id'] !== undefined) {
      return { ...row, updatedAt: now, updatedBy: this.updatedBy };
    }
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
