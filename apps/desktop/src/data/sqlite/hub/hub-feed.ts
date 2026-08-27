import type {
  ChangeLogOp,
  EntityId,
  DeviceId,
  UserId,
  HubChange,
} from '@centresoutien/domain';

/**
 * The hub's append-only change feed (SOU-90): the SQL + row shape behind
 * `SqliteHubStore.pull`. Splitting the feed's storage details out of the store
 * keeps the store under the file-size ceiling while keeping the feed's
 * write-once invariant in one place (the `hub_feed` triggers).
 */

export type HubFeedRow = {
  seq: number;
  centre_id: string;
  entity_type: string;
  entity_id: string;
  version: number;
  op: string;
  entity_json: string;
  changed_fields: string;
  device_id: string;
  updated_by: string;
  device_seq: number;
  received_at: string;
};

export const INSERT_FEED_SQL = `
  INSERT INTO hub_feed
    (centre_id, entity_type, entity_id, version, op, entity_json, changed_fields,
     device_id, updated_by, device_seq, received_at)
  VALUES
    (@centre_id, @entity_type, @entity_id, @version, @op, @entity_json, @changed_fields,
     @device_id, @updated_by, @device_seq, @received_at)
`;

/**
 * Everything accepted since a cursor, oldest first, capped at `?` rows — the
 * delta feed slice for one chunked pull. SQLite treats `LIMIT -1` as unbounded,
 * so a non-positive cap means "the whole feed" (the legacy single-shot pull).
 */
export const SELECT_FEED_AFTER_SQL = `
  SELECT * FROM hub_feed WHERE centre_id = ? AND seq > ? ORDER BY seq LIMIT ?
`;

/** How many rows are still queued past a cursor — the `remaining` progress total. */
export const COUNT_FEED_AFTER_SQL = `
  SELECT COUNT(*) AS n FROM hub_feed WHERE centre_id = ? AND seq > ?
`;

/** The current feed head — cursors and deltas are sliced on it. */
export const MAX_FEED_SEQ_SQL = `
  SELECT COALESCE(MAX(seq), 0) AS seq FROM hub_feed WHERE centre_id = ?
`;

/** Map a persisted feed row back to the wire {@link HubChange} the devices see. */
export function hubFeedRowToChange(row: HubFeedRow): HubChange {
  return {
    entityType: row.entity_type,
    entityId: row.entity_id as EntityId,
    version: row.version,
    seq: row.seq,
    op: row.op as ChangeLogOp,
    entity: JSON.parse(row.entity_json) as Record<string, unknown>,
    changedFields: JSON.parse(row.changed_fields) as string[],
    deviceId: row.device_id as DeviceId,
    updatedBy: row.updated_by as UserId,
    deviceSeq: row.device_seq,
    receivedAt: new Date(row.received_at),
  };
}
