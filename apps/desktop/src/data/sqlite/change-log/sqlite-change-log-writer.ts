import type { Database as DB } from 'better-sqlite3';
import type { Clock, DeviceId, ChangeLogWriter, ChangeLogRecordInput } from '@centresoutien/domain';
import { resolveChangeLogOp } from '@centresoutien/domain';
import { assertTableIdentifier } from './table-identifier';

const NEXT_REVISION_SQL = `
  SELECT COALESCE(MAX(revision), 0) + 1 AS next
    FROM change_log
   WHERE entity_type = ? AND entity_id = ?
`;

const INSERT_SQL = `
  INSERT INTO change_log
    (entity_type, entity_id, revision, op, payload, device_id, created_at, center_code)
  VALUES
    (@entity_type, @entity_id, @revision, @op, @payload, @device_id, @created_at, @center_code)
`;

/**
 * SQLite {@link ChangeLogWriter} (SOU-79). A repository calls `record` from
 * inside its own write transaction, so the log append and the entity write
 * commit or roll back together. The just-written row is snapshotted by reading
 * it back from its table (`entity_type` is the table name), which guarantees the
 * `payload` is exactly the persisted state for both upserts and soft deletes.
 */
export class SqliteChangeLogWriter implements ChangeLogWriter {
  constructor(
    private readonly db: DB,
    private readonly clock: Clock,
    private readonly deviceId: DeviceId,
  ) {}

  record(input: ChangeLogRecordInput): void {
    const table = assertTableIdentifier(input.entityType);
    const row = this.db
      .prepare(`SELECT * FROM ${table} WHERE id = ?`)
      .get(input.entityId) as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error(
        `change_log: no ${input.entityType} row for id ${input.entityId} to snapshot`,
      );
    }

    const { next } = this.db.prepare(NEXT_REVISION_SQL).get(input.entityType, input.entityId) as {
      next: number;
    };
    const op = resolveChangeLogOp(input.intent, next);

    this.db.prepare(INSERT_SQL).run({
      entity_type: input.entityType,
      entity_id: input.entityId,
      revision: next,
      op,
      payload: JSON.stringify(row),
      device_id: this.deviceId,
      created_at: this.clock.now().toISOString(),
      center_code: input.centerCode,
    });
  }
}
