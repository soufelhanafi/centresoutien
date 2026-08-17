import type { Database as DB } from 'better-sqlite3';
import type {
  BackupRow,
  BackupSheetName,
  BackupSheetWrite,
  BackupStore,
  CenterCode,
  ChangeLogWriter,
} from '@centresoutien/domain';
import { toEntityId } from '@centresoutien/domain';
import { fromSqlValue, IDENTITY_COLUMNS, toSqlValue, type SheetSqlConfig } from './backup-store-config';
import { SHEET_SQL } from './backup-store-sheets';
import { niveauBackupRowToEntity, subjectBackupRowToEntity } from '../change-log/change-log-entity-mappers';
import { ensurePaymentReversalUniqueIndex, REVERSAL_ONCE_INDEX } from '../repairs/payment-reversal-index';

/**
 * SQLite adapter for {@link BackupStore} (SOU-44): pure translation between the
 * domain's workbook rows and the per-center SQLCipher tables. Reads are scoped
 * to the active center and include tombstones (full backup). Writes run across
 * all sheets in one transaction — a single failing row aborts and rolls back the
 * whole import. Table and column names are hard-coded in the sheet configs
 * (never interpolated from the workbook); the only runtime inputs are bound as
 * parameters.
 *
 * Every row this adapter actually writes is also appended to the {@link
 * ChangeLogWriter} (SOU-79) inside the same transaction, so a restore converges
 * on the sync feed exactly like any other edit — a replayed row (INSERT … ON
 * CONFLICT DO NOTHING that skipped) records nothing. The logged `entity` is the
 * row's logical shape (SOU-170); `subjects` is converted to its canonical domain
 * shape first because the subject repository also writes that entityType.
 */
export class SqliteBackupStore implements BackupStore {
  constructor(
    private readonly db: DB,
    private readonly centerCode: string,
    private readonly changeLog: ChangeLogWriter,
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
      // A legacy/offline workbook can carry two reversals of one payment; the unique
      // reversal backstop would abort the whole restore (payments is a `skip` sheet whose
      // ON CONFLICT(id) can't absorb a DIFFERENT-id duplicate reversal, SOU-233). Drop it
      // inside the tx so both append-only rows are retained; a rollback restores it, and
      // ensurePaymentReversalUniqueIndex() below re-adds it (clean) or reports the pending
      // double-void (dirty) after the commit — never bricking the import.
      this.db.exec(`DROP INDEX IF EXISTS ${REVERSAL_ONCE_INDEX}`);
      for (const sheet of writes) {
        const config = SHEET_SQL[sheet.sheetName];
        for (const row of sheet.rows) {
          if (this.upsertRow(config, row)) {
            const id = row['id'];
            if (typeof id === 'string') {
              this.changeLog.record({
                entityType: config.table,
                entityId: toEntityId(id),
                centerCode: row['centerCode'] as CenterCode,
                intent: 'upsert',
                // The logical row the adapter persisted. `subjects` and `niveaux`
                // are converted to their canonical domain shapes because those
                // repositories also log that entityType (SOU-170: one payload
                // shape per type).
                entity:
                  config.table === 'subjects'
                    ? subjectBackupRowToEntity(row)
                    : config.table === 'niveaux'
                      ? niveauBackupRowToEntity(row)
                      : row,
              });
            }
          }
        }
      }
    });
    run(sheets);
    // Recreate the backstop after the commit: created when the ledger is clean, skipped
    // (with the pending double-void reported) when the import introduced one. Runs outside
    // the restore tx because a dirty import must NOT roll the whole restore back.
    ensurePaymentReversalUniqueIndex(this.db);
  }

  /**
   * Writes one row; returns true when the write actually happened (an insert or
   * an in-place update) and false when it was a no-op replay (an existing id on
   * a `conflict: 'skip'` sheet, or a row carrying only read-only columns). Only
   * real writes are logged to the change log.
   */
  private upsertRow(config: SheetSqlConfig, row: BackupRow): boolean {
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
    if (sqlColumns.length === 0) return false;

    const params: Record<string, unknown> = {};
    for (const [domainColumn, sqlColumn] of present) {
      params[sqlColumn] = toSqlValue(domainColumn, row[domainColumn]);
    }

    const placeholders = sqlColumns.map((column) => `@${column}`).join(', ');
    const insert = `INSERT INTO ${config.table} (${sqlColumns.join(', ')}) VALUES (${placeholders})`;

    if (config.conflict === 'skip') {
      const result = this.db.prepare(`${insert} ON CONFLICT(id) DO NOTHING`).run(params);
      return result.changes > 0;
    }

    const updateColumns = sqlColumns.filter((column) => !IDENTITY_COLUMNS.has(column));
    if (updateColumns.length === 0) {
      const result = this.db.prepare(`${insert} ON CONFLICT(id) DO NOTHING`).run(params);
      return result.changes > 0;
    }
    const setClause = updateColumns.map((column) => `${column} = excluded.${column}`).join(', ');
    this.db.prepare(`${insert} ON CONFLICT(id) DO UPDATE SET ${setClause}`).run(params);
    return true;
  }
}
