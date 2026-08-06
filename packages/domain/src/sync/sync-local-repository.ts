import type { ChangeLogOp } from './change-log-writer';
import type { SyncCursor } from '../ports/sync-hub-port';
import type { DeviceId, EntityId, UserId } from '../value-objects/ids';

/**
 * The device side of the sync cycle — the local replica's view of "what have I
 * written since my last sync, and what does the hub say now". Implemented by
 * the SQLite adapter over the append-only `change_log` (SOU-79) later; the
 * engine only ever talks to this interface, so the same engine drives a laptop
 * and the future web app ("laptop N+1").
 *
 * Each instance is bound to exactly ONE center (its SQLite store). Cursors and
 * pending changes are per-center by construction — if an implementation ever
 * serves multiple centers it must key its state by `centerCode` so data cannot
 * mix across tenants (see `multi-center-tenancy`).
 *
 * `entity` values are DOMAIN-shape snapshots (the versioned change_log payload),
 * so the adapter decides schema mapping on apply — the domain engine never sees
 * a physical SQLite row.
 */

/** An unsynced local write, ready to push. */
export type LocalPendingChange = {
  readonly entityType: string;
  readonly entityId: EntityId;
  readonly deviceId: DeviceId;
  /** The canonical version this write is based on (0 = never pushed). */
  readonly baseVersion: number;
  readonly op: ChangeLogOp;
  readonly entity: Record<string, unknown>;
  readonly changedFields: readonly string[];
  readonly seq: number;
  readonly at: Date;
  readonly updatedBy: UserId;
};

/** The device's full knowledge of one entity: canonical base + optional pending edit. */
export type LocalEntityState = {
  /** Last canonical version this device has applied or pushed. */
  readonly version: number;
  readonly entity: Record<string, unknown>;
  /** The unsynced local edit on top, when one exists. */
  readonly pending: LocalPendingChange | null;
};

export interface LocalSyncRepository {
  /** The device's knowledge of one entity, or null when it has never seen it. */
  getLocalState(entityType: string, entityId: EntityId): LocalEntityState | null;

  /** Fast-forward: accept the hub's canonical state (no local edit to protect). */
  applyInbound(
    entityType: string,
    entityId: EntityId,
    entity: Record<string, unknown>,
    version: number,
  ): void;

  /** Store a merged/auto-resolved write as pending, based on `baseVersion`. */
  upsertPending(input: {
    entityType: string;
    entityId: EntityId;
    deviceId: DeviceId;
    entity: Record<string, unknown>;
    changedFields: readonly string[];
    baseVersion: number;
    op: ChangeLogOp;
    updatedBy: UserId;
    at: Date;
  }): void;

  /** Record the hub-assigned canonical version after an accepted push. */
  markSynced(entityType: string, entityId: EntityId, assignedVersion: number): void;

  /**
   * Freeze a pending write behind an unresolved conflict: it must not be pushed
   * again until a human resolves it (a stale push would silently clobber the
   * other device's write). The edit itself is preserved, never lost.
   */
  blockPending(entityType: string, entityId: EntityId): void;

  /** All pushable pending writes — blocked (conflicted) ones are excluded. */
  listPending(): readonly LocalPendingChange[];

  getCursor(): SyncCursor | null;

  setCursor(cursor: SyncCursor): void;
}
