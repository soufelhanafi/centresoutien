import type { ChangeLogOp } from '../sync/change-log-writer';
import type { CenterCode, DeviceId, EntityId, UserId } from '../value-objects/ids';

/**
 * The hub is a *role*, not a machine: one canonical holder of a center's data,
 * deliberately dumb (a versioned mailbox). The device never talks to another
 * device — only to the hub. This port is the swappable seam between the
 * embedded laptop hub (SOU-81, `apps/desktop/src/main/hub-server`) and the
 * future cloud hub (`apps/api`); the engine in `packages/domain/src/sync` is
 * identical against either.
 *
 * Ordering truth is `version` counters decided by the hub's atomic push check,
 * never wall-clock timestamps: a laptop whose clock lies still syncs (its
 * timestamps are flagged in the UI), it just loses the version race like
 * everyone else.
 */

/** Position in the hub's per-center change feed. One cursor per (deviceId, centreId). */
export type SyncCursor = { readonly seq: number };

/** Composite key for an entity on the wire: `{entityType}:{entityId}`. */
export function entityKey(entityType: string, entityId: EntityId): string {
  return `${entityType}:${entityId}`;
}

/**
 * One write the hub accepted — the unit the change feed and pull deliver. `entity`
 * is the full DOMAIN-shape snapshot after the write (a tombstone after a soft
 * delete); `changedFields` is that write's per-entity change log (envelope
 * bookkeeping excluded). `receivedAt` is display context for the conflict popup
 * ("when") and is never a merge criterion. `deviceSeq` is the originating
 * device's monotonic sequence — reliable intra-device ordering even when its
 * clock is wrong.
 */
export type HubChange = {
  readonly entityType: string;
  readonly entityId: EntityId;
  /** Canonical version after this write — the optimistic-concurrency counter. */
  readonly version: number;
  /** Position in the hub's per-center feed — cursors and deltas are sliced on it. */
  readonly seq: number;
  readonly op: ChangeLogOp;
  readonly entity: Readonly<Record<string, unknown>>;
  readonly changedFields: readonly string[];
  readonly deviceId: DeviceId;
  readonly updatedBy: UserId;
  readonly deviceSeq: number;
  readonly receivedAt: Date;
};

/** Everything since a cursor, plus the new cursor and the hub's schema version. */
export type ChangeBatch = {
  readonly changes: readonly HubChange[];
  readonly cursor: SyncCursor;
  /** The hub's schema version; a too-old device must stop before it diverges. */
  readonly schemaVersion: number;
  /** The hub's clock — compared against the device's to flag skew (display only). */
  readonly hubTime: Date;
};

/** A pending local write the device wants the hub to accept. */
export type LocalChange = {
  readonly entityType: string;
  readonly entityId: EntityId;
  readonly deviceId: DeviceId;
  /** Canonical version this write is based on (0 = never pushed). */
  readonly baseVersion: number;
  readonly op: ChangeLogOp;
  readonly entity: Record<string, unknown>;
  readonly changedFields: readonly string[];
  /** Per-device monotonic sequence — ordering on this device, clock-independent. */
  readonly seq: number;
  readonly at: Date;
  readonly updatedBy: UserId;
};

export type PushResult =
  | {
      readonly status: 'accepted';
      /** Hub-assigned canonical version per entity key. */
      readonly versions: Readonly<Record<string, number>>;
      readonly cursor: SyncCursor;
    }
  | {
      readonly status: 'rejected-stale';
      /**
       * Everything the hub has accepted since this device's cursor — the device
       * re-resolves against it. The device's cursor is NOT advanced by a
       * rejection, so the next pull re-delivers it (idempotent via version skip).
       */
      readonly freshChanges: readonly HubChange[];
      readonly cursor: SyncCursor;
    };

export interface SyncHubPort {
  /**
   * Everything the hub accepted since `cursor` (from 0 when null). The hub
   * advances and returns the device's new cursor. The device's own local cursor
   * is the source of truth — the hub additionally tracks one cursor per
   * `(deviceId, centreId)` for its own bookkeeping: serving the fresh feed on a
   * rejected push, and compacting the change feed no further than the oldest
   * live cursor.
   */
  pullChanges(centreId: CenterCode, cursor: SyncCursor | null, deviceId: DeviceId): Promise<ChangeBatch>;

  /**
   * Apply `changes` iff every entity's `baseVersion` equals the hub's current
   * canonical version — checked for the WHOLE batch first, atomically, so two
   * simultaneous syncs can never both win. A stale push is rejected whole and
   * the device re-runs pull → resolve → push (one cheap retry loop serializes
   * concurrent syncs without locks). `schemaVersion` is the device's; the hub
   * rejects a device older than itself with `SchemaTooOldError`.
   */
  pushChanges(input: {
    centreId: CenterCode;
    deviceId: DeviceId;
    changes: readonly LocalChange[];
    baseVersions: Readonly<Record<string, number>>;
    schemaVersion: number;
  }): Promise<PushResult>;

  /** The last feed position this (deviceId, centreId) pair consumed — null when never synced. */
  getCursor(deviceId: DeviceId, centreId: CenterCode): Promise<SyncCursor | null>;
}
