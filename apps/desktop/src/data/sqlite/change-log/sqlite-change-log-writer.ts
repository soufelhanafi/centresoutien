import type { Database as DB } from 'better-sqlite3';
import type { Clock, DeviceId, ChangeLogWriter, ChangeLogRecordInput } from '@centresoutien/domain';
import { resolveChangeLogOp, serializeChangeLogPayload } from '@centresoutien/domain';

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
 * commit or roll back together. The caller hands the writer the DOMAIN entity
 * it just persisted (the tombstoned shape for a soft delete); the writer
 * serializes it as a versioned payload (SOU-170) — never a physical row — so
 * old log rows keep replaying across schema migrations and, later, a device at
 * a different schema version can upcast before sync-apply.
 */
export class SqliteChangeLogWriter implements ChangeLogWriter {
  constructor(
    private readonly db: DB,
    private readonly clock: Clock,
    private readonly deviceId: DeviceId,
  ) {}

  record(input: ChangeLogRecordInput): void {
    const { next } = this.db.prepare(NEXT_REVISION_SQL).get(input.entityType, input.entityId) as {
      next: number;
    };
    const op = resolveChangeLogOp(input.intent, next);

    this.db.prepare(INSERT_SQL).run({
      entity_type: input.entityType,
      entity_id: input.entityId,
      revision: next,
      op,
      payload: serializeChangeLogPayload(input.entity),
      device_id: this.deviceId,
      created_at: this.clock.now().toISOString(),
      center_code: input.centerCode,
    });
  }
}
