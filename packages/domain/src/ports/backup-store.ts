import type { BackupRow, BackupSheetName } from '../backup/backup-workbook';

/** One sheet's rows to apply, in the workbook's domain-column shape. */
export type BackupSheetWrite = {
  sheetName: BackupSheetName;
  rows: readonly BackupRow[];
};

/**
 * Row-level persistence port for the backup engine (SOU-44) — distinct from the
 * byte-level {@link BackupPort} (SOU-102) that snapshots the whole SQLCipher
 * file. This port moves *rows*, so the domain can build the Excel workbook and
 * run preview/apply without knowing any table or column name.
 *
 * - `readAllRows` returns every row of the center — tombstones included — so a
 *   backup round-trips the full history, not just live rows.
 * - `applyRows` persists all sheets **in a single transaction**: any failure
 *   rolls back the whole import (KICKOFF: atomic apply). The domain passes
 *   sheets already ordered in dependency order (parents → students → dependents).
 * - The adapter is tenant-scoped (constructed per open center DB), and `applyRows`
 *   rejects rows whose `centerCode` differs from the active center — importing
 *   one center's backup into another is a later ticket.
 */
export interface BackupStore {
  readAllRows(sheetName: BackupSheetName): Promise<readonly BackupRow[]>;
  applyRows(sheets: readonly BackupSheetWrite[]): Promise<void>;
}
