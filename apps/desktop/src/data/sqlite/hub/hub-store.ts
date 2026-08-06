import type { Database as DB } from 'better-sqlite3';
import { join } from 'node:path';
import { openDatabaseAt } from '../db';
import {
  entityKey,
  SCHEMA_VERSION,
  SchemaTooOldError,
  type ChangeBatch,
  type Clock,
  type DeviceId,
  type CenterCode,
  type LocalChange,
  type PushResult,
  type SyncCursor,
} from '@centresoutien/domain';
import {
  hubFeedRowToChange,
  INSERT_FEED_SQL,
  MAX_FEED_SEQ_SQL,
  SELECT_FEED_AFTER_SQL,
  type HubFeedRow,
} from './hub-feed';

/** The encrypted hub file for a center — one per center, like the business DB. */
export function hubDbFileName(centreId: string): string {
  return `hub-${centreId}.db`;
}

const UPSERT_ENTITY_SQL = `
  INSERT INTO hub_entity (centre_id, entity_type, entity_id, version, entity_json, updated_at)
  VALUES (@centre_id, @entity_type, @entity_id, @version, @entity_json, @updated_at)
  ON CONFLICT(centre_id, entity_type, entity_id)
  DO UPDATE SET version = excluded.version, entity_json = excluded.entity_json, updated_at = excluded.updated_at
`;

const UPSERT_CURSOR_SQL = `
  INSERT INTO hub_cursor (device_id, centre_id, seq)
  VALUES (@device_id, @centre_id, @seq)
  ON CONFLICT(device_id, centre_id) DO UPDATE SET seq = excluded.seq
`;

const UPSERT_CENTER_SQL = `
  INSERT INTO hub_center (centre_id, pairing_token, created_at)
  VALUES (?, ?, ?)
  ON CONFLICT(centre_id) DO UPDATE SET pairing_token = excluded.pairing_token
`;

/** The hub side of one push — everything the atomic accept-or-reject needs. */
type PushInput = {
  centreId: CenterCode;
  deviceId: DeviceId;
  changes: readonly LocalChange[];
  schemaVersion: number;
};

/**
 * SQLite canonical store for the embedded hub (SOU-90). Implements the hub
 * side of the {@link SyncHubPort} protocol — canonical rows with `version`,
 * an append-only feed, one cursor per `(deviceId, centreId)` — and nothing
 * else. It is deliberately dumb: it has no merge rule, no conflict logic, no
 * business predicate. Resolution stays in `packages/domain/src/sync`; the hub
 * only decides *accept vs reject* by the atomic base-version check, exactly
 * like the in-memory hub the engine tests against.
 *
 * One SQLCipher file per center (`hub-<centreId>.db`, same key as the business
 * DB), so the canonical store honors the same tenancy + encryption rules as the
 * replicas it feeds.
 */
export class SqliteHubStore {
  readonly db: DB;

  constructor(
    db: DB,
    private readonly clock: Clock,
  ) {
    this.db = db;
  }

  /** Open + migrate the hub file for a center. */
  static open(
    options: { centreId: string; key: string; dir: string },
    clock: Clock,
  ): SqliteHubStore {
    return new SqliteHubStore(
      openDatabaseAt(join(options.dir, hubDbFileName(options.centreId)), options.key),
      clock,
    );
  }

  /** (Re)store the LAN pairing token for a center — idempotent, called at hub start. */
  registerCenter(centreId: CenterCode, token: string, now: Date): void {
    this.db.prepare(UPSERT_CENTER_SQL).run(centreId, token, now.toISOString());
  }

  /** The center's current pairing token, or null when the hub does not host it. */
  tokenFor(centreId: CenterCode): string | null {
    const row = this.db
      .prepare('SELECT pairing_token FROM hub_center WHERE centre_id = ?')
      .get(centreId) as { pairing_token: string } | undefined;
    return row?.pairing_token ?? null;
  }

  /**
   * Everything the hub accepted since `cursor` (from 0 when null), plus the
   * device's new cursor. Updates the hub's own cursor bookkeeping for
   * `(deviceId, centreId)` — the device's local cursor stays the source of
   * truth; the hub's copy is for retention/compaction decisions.
   */
  pull(centreId: CenterCode, cursor: SyncCursor | null, deviceId: DeviceId): ChangeBatch {
    const start = cursor?.seq ?? 0;
    const rows = this.db.prepare(SELECT_FEED_AFTER_SQL).all(centreId, start) as HubFeedRow[];
    const nextCursor = this.feedHead(centreId);
    this.setCursor(deviceId, centreId, nextCursor);
    return {
      changes: rows.map((row) => hubFeedRowToChange(row)),
      cursor: nextCursor,
      schemaVersion: SCHEMA_VERSION,
      hubTime: this.clock.now(),
    };
  }

  /**
   * Apply `changes` iff every entity's `baseVersion` equals the hub's current
   * canonical version — checked for the WHOLE batch first, inside one
   * transaction, so two simultaneous syncs can never both win. A stale push is
   * rejected whole (the device re-runs pull → resolve → push). A device older
   * than the hub throws `SchemaTooOldError` — never silently written.
   */
  push(input: PushInput): PushResult {
    // A device NEWER than the hub is stopped upstream, not here: the engine
    // compares the hub's schemaVersion (returned on every pull) against its own
    // and throws SchemaTooOldError before it ever pushes. The hub stores entity
    // snapshots as opaque JSON, so a newer shape would be harmless — the
    // handshake still guarantees only devices that understand the hub's shapes
    // write to it.
    if (input.schemaVersion < SCHEMA_VERSION) {
      throw new SchemaTooOldError(input.schemaVersion, SCHEMA_VERSION);
    }
    return this.db.transaction((): PushResult => {
      const accepted = this.acceptIfFresh(input);
      if (accepted === null) return this.rejectedResult(input.deviceId, input.centreId);
      const cursor = this.acceptedCursor(input, accepted.firstSeq, accepted.lastSeq);
      this.setCursor(input.deviceId, input.centreId, cursor);
      return { status: 'accepted', versions: accepted.versions, cursor };
    })();
  }

  /**
   * The atomic accept-or-reject core: verify every base version against the
   * canonical state FIRST (whole batch, inside the caller's transaction), then
   * write canonical rows + feed rows. Returns null when any entity is stale —
   * nothing is touched, so a rejected push is a strict no-op. When accepted,
   * `firstSeq`/`lastSeq` bound the contiguous feed span this batch inserted
   * (null for an empty batch).
   */
  private acceptIfFresh(
    input: PushInput,
  ): { versions: Record<string, number>; firstSeq: number | null; lastSeq: number | null } | null {
    for (const change of input.changes) {
      const current = this.canonicalVersion(input.centreId, change.entityType, change.entityId);
      if (current !== change.baseVersion) return null;
    }
    const versions: Record<string, number> = {};
    let firstSeq: number | null = null;
    let lastSeq: number | null = null;
    for (const change of input.changes) {
      const current = this.canonicalVersion(input.centreId, change.entityType, change.entityId);
      const version = current + 1;
      const stamped = { ...change.entity, version };
      const now = this.clock.now().toISOString();
      this.db.prepare(UPSERT_ENTITY_SQL).run({
        centre_id: input.centreId,
        entity_type: change.entityType,
        entity_id: change.entityId,
        version,
        entity_json: JSON.stringify(stamped),
        updated_at: now,
      });
      const rowid = this.db.prepare(INSERT_FEED_SQL).run({
        centre_id: input.centreId,
        entity_type: change.entityType,
        entity_id: change.entityId,
        version,
        op: change.op,
        entity_json: JSON.stringify(stamped),
        changed_fields: JSON.stringify(change.changedFields),
        device_id: change.deviceId,
        updated_by: change.updatedBy,
        device_seq: change.seq,
        received_at: now,
      }).lastInsertRowid;
      firstSeq = firstSeq ?? Number(rowid);
      lastSeq = Number(rowid);
      versions[entityKey(change.entityType, change.entityId)] = version;
    }
    return { versions, firstSeq, lastSeq };
  }

  /**
   * The device's cursor after an accepted push. The device has consumed the
   * feed up to its last pull (`cursorFor`), plus — and only if CONTIGUOUS —
   * the batch it just pushed. If another device's row landed in the gap (the
   * batch's first seq is not `lastCursor + 1`), the device has NOT seen it, so
   * its cursor stays at the last consumed position and the next pull
   * re-delivers the gap row (the resolver's version-skip dedupes this device's
   * own batch). Advancing past unseen rows would drop them forever.
   */
  private acceptedCursor(input: PushInput, firstSeq: number | null, lastSeq: number | null): SyncCursor {
    const consumed = this.cursorFor(input.deviceId, input.centreId) ?? { seq: 0 };
    if (firstSeq !== null && lastSeq !== null && consumed.seq + 1 === firstSeq) {
      return { seq: lastSeq };
    }
    return consumed;
  }

  /** The hub's bookkeeping cursor for a device — null when it has never synced. */
  cursorFor(deviceId: DeviceId, centreId: CenterCode): SyncCursor | null {
    const row = this.db.prepare('SELECT seq FROM hub_cursor WHERE device_id = ? AND centre_id = ?').get(
      deviceId,
      centreId,
    ) as { seq: number } | undefined;
    return row ? { seq: row.seq } : null;
  }

  /** Test probe: the canonical version of an entity, or 0 when never pushed. */
  canonicalVersion(centreId: CenterCode, entityType: string, entityId: string): number {
    const row = this.db
      .prepare('SELECT version FROM hub_entity WHERE centre_id = ? AND entity_type = ? AND entity_id = ?')
      .get(centreId, entityType, entityId) as { version: number } | undefined;
    return row?.version ?? 0;
  }

  close(): void {
    if (this.db.open) this.db.close();
  }

  private setCursor(deviceId: DeviceId, centreId: CenterCode, cursor: SyncCursor): void {
    this.db.prepare(UPSERT_CURSOR_SQL).run({ device_id: deviceId, centre_id: centreId, seq: cursor.seq });
  }

  private feedHead(centreId: CenterCode): SyncCursor {
    const row = this.db.prepare(MAX_FEED_SEQ_SQL).get(centreId) as { seq: number };
    return { seq: row.seq };
  }

  private rejectedResult(deviceId: DeviceId, centreId: CenterCode): PushResult {
    const cursor = this.cursorFor(deviceId, centreId);
    return { status: 'rejected-stale', cursor: cursor ?? { seq: 0 } };
  }
}
