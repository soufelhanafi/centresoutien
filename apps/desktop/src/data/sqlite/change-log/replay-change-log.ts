import type { Database as DB } from 'better-sqlite3';
import type { ChangeLogPayloadUpcaster } from '@centresoutien/domain';
import { deserializeChangeLogPayload } from '@centresoutien/domain';
import { getChangeLogEntityToRowMapper } from './change-log-entity-mappers';
import { assertSqlIdentifier } from './table-identifier';

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
 * Each payload is a versioned DOMAIN entity (SOU-170): it is deserialized
 * through the upcaster chain and mapped onto the CURRENT physical row by the
 * per-entityType mapper before the upsert, so a log row written under an older
 * schema still replays onto today's columns (a physical-row payload would break
 * the moment a migration renames/drops/re-types a column).
 *
 * Replay writes directly to the entity tables, NOT through the logging
 * repositories, so it never appends new change_log rows (a replay of the log
 * must not grow the log). Intended target: a freshly migrated database with
 * empty entity tables.
 */
export function replayChangeLog(
  db: DB,
  upcasters: readonly ChangeLogPayloadUpcaster[] = [],
): void {
  const rows = db
    .prepare('SELECT entity_type, payload FROM change_log ORDER BY rowid')
    .all() as ChangeLogReplayRow[];

  const upsert = db.transaction((entries: ChangeLogReplayRow[]) => {
    for (const entry of entries) {
      const table = assertSqlIdentifier(entry.entity_type);
      const mapper = getChangeLogEntityToRowMapper(entry.entity_type);
      if (!mapper) {
        throw new Error(
          `change_log: no entity→row mapper registered for "${entry.entity_type}" — replay refuses to guess a table/column shape`,
        );
      }
      const entity = deserializeChangeLogPayload(entry.payload, upcasters);
      upsertSnapshot(db, table, mapper(entity));
    }
  });
  upsert(rows);
}

function upsertSnapshot(db: DB, table: string, snapshot: Record<string, unknown>): void {
  // Replay-into-empty semantics: the upsert rewrites every non-`id` column,
  // including the envelope (center_code, device_origin, created_at, version).
  // Correct ONLY for rebuilding an empty table from the log. If SOU-80's
  // sync-apply ever reuses this, it must exclude IDENTITY_COLUMNS (see
  // backup-store-config) so an applied payload cannot clobber a newer local
  // revision — do not copy this function as-is into the apply path.
  const columns = Object.keys(snapshot).map(assertSqlIdentifier);
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
