import type { Database as DB } from 'better-sqlite3';
import { assertTableIdentifier } from './table-identifier';

type ChangeLogReplayRow = {
  entity_type: string;
  payload: string;
};

/**
 * Rebuilds entity tables from the append-only change_log (SOU-79 "done when":
 * replaying the log reconstructs DB state). Reads every row in causal order
 * (rowid == insertion order) and upserts its full snapshot into the entity's
 * table — the last write per id wins, and soft deletes carry through because the
 * snapshot includes `deleted_at`.
 *
 * Replay writes directly to the entity tables, NOT through the logging
 * repositories, so it never appends new change_log rows (a replay of the log
 * must not grow the log). Intended target: a freshly migrated database with
 * empty entity tables.
 */
export function replayChangeLog(db: DB): void {
  const rows = db
    .prepare('SELECT entity_type, payload FROM change_log ORDER BY rowid')
    .all() as ChangeLogReplayRow[];

  const upsert = db.transaction((entries: ChangeLogReplayRow[]) => {
    for (const entry of entries) {
      const table = assertTableIdentifier(entry.entity_type);
      const snapshot = JSON.parse(entry.payload) as Record<string, unknown>;
      upsertSnapshot(db, table, snapshot);
    }
  });
  upsert(rows);
}

function upsertSnapshot(db: DB, table: string, snapshot: Record<string, unknown>): void {
  const columns = Object.keys(snapshot);
  const insertColumns = columns.join(', ');
  const insertValues = columns.map((column) => `@${column}`).join(', ');
  const updates = columns
    .filter((column) => column !== 'id')
    .map((column) => `${column} = excluded.${column}`)
    .join(', ');

  const sql = `
    INSERT INTO ${table} (${insertColumns})
    VALUES (${insertValues})
    ON CONFLICT(id) DO UPDATE SET ${updates}
  `;
  db.prepare(sql).run(snapshot);
}
