import type { Database as DB } from 'better-sqlite3';
import type { BackupRow, BackupSheetName, BackupSheetWrite, BackupStore } from '@centresoutien/domain';
import {
  fromSqlValue,
  IDENTITY_COLUMNS,
  toSqlValue,
  type SheetSqlConfig,
} from './backup-store-config';
import { SHEET_SQL_A } from './backup-store-sheets-a';
import { SHEET_SQL_B } from './backup-store-sheets-b';

const SHEET_SQL: Readonly<Record<BackupSheetName, SheetSqlConfig>> = {
  ...SHEET_SQL_A,
  ...SHEET_SQL_B,
};
/**
 * SQLite adapter for {@link BackupStore} (SOU-44): pure translation between the
 * domain's workbook rows and the per-center SQLCipher tables. Reads are scoped
 * to the active center and include tombstones (full backup). Writes run across
 * all sheets in one transaction — a single failing row aborts and rolls back the
 * whole import. Table and column names are hard-coded in the sheet configs
 * (never interpolated from the workbook); the only runtime inputs are bound as
 * parameters.
 */
export class SqliteBackupStore implements BackupStore {
  constructor(
    private readonly db: DB,
    private readonly centerCode: string,
  ) {}

  async readAllRows(sheetName: BackupSheetName): Promise<readonly BackupRow[]> {
    const config = SHEET_SQL[sheetName];
    const sqlColumns = config.columns.map(([, sql]) => sql).join(', ');
    const rows = this.db
      .prepare(`SELECT ${sqlColumns} FROM ${config.table} WHERE center_code = ? ORDER BY rowid`)
      .all(this.centerCode) as Record<string, unknown>[];

    return rows.map((row) => {
      const backupRow: BackupRow = {};
      for (const [domainColumn, sqlColumn] of config.columns) {
        backupRow[domainColumn] = fromSqlValue(domainColumn, row[sqlColumn]);
      }
      return backupRow;
    });
  }

  async applyRows(sheets: readonly BackupSheetWrite[]): Promise<void> {
    const run = this.db.transaction((writes: readonly BackupSheetWrite[]) => {
      for (const sheet of writes) {
        const config = SHEET_SQL[sheet.sheetName];
        for (const row of sheet.rows) {
          this.upsertRow(config, row);
        }
      }
    });
    run(sheets);
  }

  private upsertRow(config: SheetSqlConfig, row: BackupRow): void {
    // Tenancy defense-in-depth: the domain classifies wrong-center rows before
    // they ever reach the store, but a direct adapter call must not be able to
    // write another center's rows into this DB (a cross-tenant write is
    // unrecoverable corruption).
    if (row['centerCode'] !== this.centerCode) {
      throw new Error(
        `refusing to write a row for center ${row['centerCode'] ?? '(missing)'} into ${this.centerCode}`,
      );
    }
    const readOnly = new Set(config.readOnlyColumns ?? []);
    const present = config.columns.filter(
      ([domainColumn]) => row[domainColumn] !== undefined && !readOnly.has(domainColumn),
    );
    const sqlColumns = present.map(([, sql]) => sql);
    if (sqlColumns.length === 0) return;

    const params: Record<string, unknown> = {};
    for (const [domainColumn, sqlColumn] of present) {
      params[sqlColumn] = toSqlValue(domainColumn, row[domainColumn]);
    }

    const placeholders = sqlColumns.map((column) => `@${column}`).join(', ');
    const insert = `INSERT INTO ${config.table} (${sqlColumns.join(', ')}) VALUES (${placeholders})`;

    if (config.conflict === 'skip') {
      this.db.prepare(`${insert} ON CONFLICT(id) DO NOTHING`).run(params);
      return;
    }

    const updateColumns = sqlColumns.filter((column) => !IDENTITY_COLUMNS.has(column));
    if (updateColumns.length === 0) {
      this.db.prepare(`${insert} ON CONFLICT(id) DO NOTHING`).run(params);
      return;
    }
    const setClause = updateColumns.map((column) => `${column} = excluded.${column}`).join(', ');
    this.db.prepare(`${insert} ON CONFLICT(id) DO UPDATE SET ${setClause}`).run(params);
  }
}
