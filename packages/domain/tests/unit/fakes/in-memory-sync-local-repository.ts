import type { Clock } from '../../../src/ports/clock';
import { entityKey, type SyncCursor } from '../../../src/ports/sync-hub-port';
import type { ChangeLogOp } from '../../../src/sync/change-log-writer';
import type { SyncConflict } from '../../../src/sync/conflicts';
import type {
  LocalEntityState,
  LocalPendingChange,
  LocalSyncRepository,
} from '../../../src/sync/sync-local-repository';
import type { DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';

/**
 * In-memory {@link LocalSyncRepository} — the device side of the cycle, standing
 * in for the change_log-backed SQLite adapter. Mirrors its semantics: entities
 * keyed by (entityType, entityId) carry a canonical `version` and an optional
 * unsynced `pending` write; blocked (conflicted) pending writes are excluded
 * from `listPending` so they can never be pushed until a human resolves them.
 */
export class InMemorySyncLocalRepository implements LocalSyncRepository {
  private readonly clock: Clock;
  readonly deviceId: DeviceId;
  private readonly store = new Map<string, StoredState>();
  private cursorValue: SyncCursor | null = null;
  private seqCounter = 0;

  constructor(clock: Clock, deviceId: DeviceId) {
    this.clock = clock;
    this.deviceId = deviceId;
  }

  getLocalState(entityType: string, entityId: EntityId): LocalEntityState | null {
    const state = this.store.get(entityKey(entityType, entityId));
    if (!state) return null;
    return { version: state.version, entity: state.entity, pending: state.pending };
  }

  applyInbound(entityType: string, entityId: EntityId, entity: Record<string, unknown>, version: number): void {
    this.store.set(entityKey(entityType, entityId), { version, entity, pending: null, blocked: false, conflict: null });
  }

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
  }): void {
    this.seqCounter++;
    const pending: LocalPendingChange = {
      entityType: input.entityType,
      entityId: input.entityId,
      deviceId: input.deviceId,
      baseVersion: input.baseVersion,
      op: input.op,
      entity: input.entity,
      changedFields: input.changedFields,
      seq: this.seqCounter,
      at: input.at,
      updatedBy: input.updatedBy,
    };
    this.store.set(entityKey(input.entityType, input.entityId), {
      version: input.baseVersion,
      entity: input.entity,
      pending,
      blocked: false,
      conflict: null,
    });
  }

  markSynced(entityType: string, entityId: EntityId, assignedVersion: number): void {
    const key = entityKey(entityType, entityId);
    const state = this.store.get(key);
    if (!state) return;
    this.store.set(key, {
      version: assignedVersion,
      entity: { ...state.entity, version: assignedVersion },
      pending: null,
      blocked: false,
      conflict: null,
    });
  }

  blockPending(entityType: string, entityId: EntityId, conflict?: SyncConflict): void {
    const key = entityKey(entityType, entityId);
    const state = this.store.get(key);
    if (state?.pending) this.store.set(key, { ...state, blocked: true, conflict: conflict ?? null });
  }

  listBlocked(): readonly SyncConflict[] {
    return [...this.store.values()]
      .filter((state) => state.conflict !== null)
      .map((state) => state.conflict as SyncConflict);
  }

  resolveBlocked(input: {
    entityType: string;
    entityId: EntityId;
    entity: Record<string, unknown>;
    changedFields: readonly string[];
    baseVersion: number;
    op: ChangeLogOp;
    updatedBy: UserId;
    at: Date;
  }): void {
    this.seqCounter++;
    const key = entityKey(input.entityType, input.entityId);
    const pending: LocalPendingChange = {
      entityType: input.entityType,
      entityId: input.entityId,
      deviceId: this.deviceId,
      baseVersion: input.baseVersion,
      op: input.op,
      entity: input.entity,
      changedFields: input.changedFields,
      seq: this.seqCounter,
      at: input.at,
      updatedBy: input.updatedBy,
    };
    this.store.set(key, {
      version: input.baseVersion,
      entity: input.entity,
      pending,
      blocked: false,
      conflict: null,
    });
  }

  listPending(): readonly LocalPendingChange[] {
    return [...this.store.values()]
      .filter((state) => state.pending !== null && !state.blocked)
      .map((state) => state.pending as LocalPendingChange);
  }

  getCursor(): SyncCursor | null {
    return this.cursorValue;
  }

  setCursor(cursor: SyncCursor): void {
    this.cursorValue = cursor;
  }

  /** Test probe: how many times the engine batched a page through here — the
   *  real SQLite adapter turns each call into one transaction instead of one
   *  per entity, so this counts pages, not entities. */
  runBatchCalls = 0;

  runBatch<T>(fn: () => T): T {
    this.runBatchCalls++;
    return fn();
  }

  // ----- Test / device-simulation helpers (mirror what change_log would record) -----

  /** Record a local upsert write exactly as the change_log adapter would. */
  writeLocal(entityType: string, entityId: EntityId, entity: Record<string, unknown>, changedFields: readonly string[], updatedBy: UserId): void {
    const key = entityKey(entityType, entityId);
    const existing = this.store.get(key);
    const baseVersion = existing?.version ?? 0;
    const op: ChangeLogOp = existing ? 'update' : 'create';
    this.seqCounter++;
    const snapshot = { ...entity, version: baseVersion, updatedAt: this.clock.now(), updatedBy };
    const pending: LocalPendingChange = {
      entityType,
      entityId,
      deviceId: this.deviceId,
      baseVersion,
      op,
      entity: snapshot,
      changedFields,
      seq: this.seqCounter,
      at: this.clock.now(),
      updatedBy,
    };
    this.store.set(key, { version: baseVersion, entity: snapshot, pending, blocked: false, conflict: null });
  }

  /** Record a soft-delete write exactly as the change_log adapter would. */
  writeLocalDelete(entityType: string, entityId: EntityId, updatedBy: UserId): void {
    const key = entityKey(entityType, entityId);
    const existing = this.store.get(key);
    const baseVersion = existing?.version ?? 0;
    this.seqCounter++;
    const snapshot: Record<string, unknown> = {
      ...(existing?.entity ?? {}),
      deletedAt: this.clock.now(),
      updatedAt: this.clock.now(),
      updatedBy,
    };
    const pending: LocalPendingChange = {
      entityType,
      entityId,
      deviceId: this.deviceId,
      baseVersion,
      op: 'delete',
      entity: snapshot,
      changedFields: [],
      seq: this.seqCounter,
      at: this.clock.now(),
      updatedBy,
    };
    this.store.set(key, { version: baseVersion, entity: snapshot, pending, blocked: false, conflict: null });
  }

  /** Test probe: the current entity snapshot, or null when never seen. */
  entity(entityType: string, entityId: EntityId): Record<string, unknown> | null {
    return this.store.get(entityKey(entityType, entityId))?.entity ?? null;
  }

  /** Test probe: true when the entity's pending write is blocked behind a conflict. */
  isBlocked(entityType: string, entityId: EntityId): boolean {
    return this.store.get(entityKey(entityType, entityId))?.blocked ?? false;
  }

  /** Test probe: every entity snapshot, keyed, for convergence assertions. */
  allEntities(): Readonly<Record<string, Record<string, unknown>>> {
    const out: Record<string, Record<string, unknown>> = {};
    for (const [key, state] of this.store) {
      out[key] = state.entity;
    }
    return out;
  }

  /** Test probe: typed people list (by id prefix, e.g. 'stu_') for a DuplicateMatchSource. */
  livePeople<T>(idPrefix: string): readonly T[] {
    return [...this.store.values()]
      .filter((state) => state.entity['deletedAt'] == null)
      .filter((state) => String(state.entity['id'] ?? '').startsWith(idPrefix))
      .map((state) => state.entity as T);
  }
}

type StoredState = {
  version: number;
  entity: Record<string, unknown>;
  pending: LocalPendingChange | null;
  blocked: boolean;
  conflict: SyncConflict | null;
};
