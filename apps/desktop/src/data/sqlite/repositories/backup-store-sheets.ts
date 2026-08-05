import type { BackupSheetName } from "@centresoutien/domain";
import type { SheetSqlConfig } from "./backup-store-config";
import { SHEET_SQL_A } from "./backup-store-sheets-a";
import { SHEET_SQL_B } from "./backup-store-sheets-b";

/**
 * The aggregate logical→physical column registry for every center table
 * (SOU-44): domain column name → SQLite column name plus per-sheet write
 * behavior. Shared by {@link SqliteBackupStore} (read/write) and the change-log
 * replay mapper (SOU-170), which maps a logical payload back to the current
 * physical row using the same column pairs — one registry, one mapping, no
 * drift between the two consumers.
 */
export const SHEET_SQL: Readonly<Record<BackupSheetName, SheetSqlConfig>> = {
  ...SHEET_SQL_A,
  ...SHEET_SQL_B,
};
