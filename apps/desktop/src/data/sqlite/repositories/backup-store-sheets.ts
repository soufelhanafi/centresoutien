import type { BackupSheetName } from '@centresoutien/domain';
import type { SheetSqlConfig } from './backup-store-config';
import { SHEET_SQL_A } from './backup-store-sheets-a';
import { SHEET_SQL_B } from './backup-store-sheets-b';

/**
 * The aggregate logical→physical column registry for every center table
 * (SOU-44): domain column name → SQLite column name plus per-sheet write
 * behavior. Shared by {@link SqliteBackupStore} (read/write) and the change-log
 * replay mapper (SOU-170), which maps a logical payload back to the current
 * physical row using the same column pairs — one registry, one mapping, no
 * drift between the two consumers.
 *
 * Keyed by the workbook SHEET name (kebab-case, e.g. `student-subscriptions`).
 * The physical TABLE name differs for multi-word sheets (`student_subscriptions`);
 * {@link SHEET_BY_TABLE} is the same configs re-indexed by `config.table`, so a
 * `change_log.entity_type` (= table name, SOU-170) resolves to the right config
 * for both names. Both indexes derive from the one sheet config list below —
 * never re-declare a sheet/table pair anywhere else.
 */
export const SHEET_SQL: Readonly<Record<BackupSheetName, SheetSqlConfig>> = {
  ...SHEET_SQL_A,
  ...SHEET_SQL_B,
};

/** The same {@link SHEET_SQL} configs, re-indexed by physical table name — what
 *  the change-log machinery resolves `entity_type` against. */
export const SHEET_BY_TABLE: ReadonlyMap<string, SheetSqlConfig> = new Map(
  Object.values(SHEET_SQL as Readonly<Record<string, SheetSqlConfig>>).map((config) => [
    config.table,
    config,
  ]),
);
