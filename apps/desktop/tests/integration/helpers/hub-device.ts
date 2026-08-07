import {
  DuplicateMatcher,
  PLANS,
  PlanPolicy,
  SyncEngine,
  type ChangeLogOp,
  type CenterCode,
  type Clock,
  type DeviceId,
  type EntityId,
  type LocalEntityState,
  type LocalPendingChange,
  type LocalSyncRepository,
  type SyncCursor,
  type SyncHubPort,
  type UserId,
} from '@centresoutien/domain';

/**
 * A simulated laptop for the SOU-90 hub integration test. The device side of
 * the cycle (the change_log-backed SQLite local store) is not built yet, so a
 * compact in-memory {@link LocalSyncRepository} stands in, with the same
 * semantics the engine relies on: canonical version per entity, one optional
 * pending edit, blocked conflicts excluded from push. The hub side is real —
 * {@link SyncHubPort} over HTTP to the embedded hub server.
 */

const NO_DUPLICATES = new DuplicateMatcher({
  findParentsByPhone: () => [],
  findTeachersByPhone: () => [],
  findStudentsByName: () => [],
});

export class HubDevice {
  readonly local: InMemoryLocalSyncRepository;
  private readonly engine: SyncEngine;

  constructor(input: {
    hub: SyncHubPort;
    clock: Clock;
    deviceId: DeviceId;
    updatedBy: UserId;
  }) {
    this.local = new InMemoryLocalSyncRepository(input.clock, input.deviceId);
    this.engine = new SyncEngine({
      hub: input.hub,
      local: this.local,
      clock: input.clock,
      plan: new PlanPolicy(PLANS.premium),
      deviceId: input.deviceId,
      updatedBy: input.updatedBy,
      centreId: CENTER,
      userCanResolve: true,
    });
  }

  /** A local edit, exactly as the change_log adapter would record it. */
  write(
    entityType: string,
    entityId: EntityId,
    entity: Record<string, unknown>,
    changedFields: readonly string[],
    updatedBy: UserId,
  ): void {
    this.local.writeLocal(entityType, entityId, entity, changedFields, updatedBy);
  }

  writeDelete(entityType: string, entityId: EntityId, updatedBy: UserId): void {
    this.local.writeLocalDelete(entityType, entityId, updatedBy);
  }

  /** Run the full pull → resolve → push cycle; asserts it converged. */
  async sync(): Promise<{ applied: number; pushed: number }> {
    const result = await this.engine.run(NO_DUPLICATES);
    if (result.status !== 'synced') {
      throw new Error(`sync retries exhausted (conflicts: ${result.conflicts.length})`);
    }
    return { applied: result.applied, pushed: result.pushed };
  }

  entity(entityType: string, entityId: EntityId): Record<string, unknown> | null {
    return this.local.entity(entityType, entityId);
  }
}

export const CENTER = 'CS-CASA-001' as CenterCode;

/**
 * In-memory {@link LocalSyncRepository} — mirrors the domain test fake's
 * semantics (see `packages/domain/tests/unit/fakes/in-memory-sync-local-repository.ts`).
 */
export class InMemoryLocalSyncRepository implements LocalSyncRepository {
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
    this.store.set(entityKey(entityType, entityId), { version, entity, pending: null, blocked: false });
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
    this.store.set(entityKey(input.entityType, input.entityId), {
      version: input.baseVersion,
      entity: input.entity,
      pending: {
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
      },
      blocked: false,
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
    });
  }

  blockPending(entityType: string, entityId: EntityId): void {
    const key = entityKey(entityType, entityId);
    const state = this.store.get(key);
    if (state?.pending) this.store.set(key, { ...state, blocked: true });
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

  // ----- Device-simulation helpers (what the change_log adapter would record) -----

  writeLocal(
    entityType: string,
    entityId: EntityId,
    entity: Record<string, unknown>,
    changedFields: readonly string[],
    updatedBy: UserId,
  ): void {
    const key = entityKey(entityType, entityId);
    const existing = this.store.get(key);
    const baseVersion = existing?.version ?? 0;
    this.seqCounter++;
    const snapshot = { ...entity, version: baseVersion, updatedAt: this.clock.now(), updatedBy };
    this.store.set(key, {
      version: baseVersion,
      entity: snapshot,
      pending: {
        entityType,
        entityId,
        deviceId: this.deviceId,
        baseVersion,
        op: existing ? 'update' : 'create',
        entity: snapshot,
        changedFields,
        seq: this.seqCounter,
        at: this.clock.now(),
        updatedBy,
      },
      blocked: false,
    });
  }

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
    this.store.set(key, {
      version: baseVersion,
      entity: snapshot,
      pending: {
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
      },
      blocked: false,
    });
  }

  entity(entityType: string, entityId: EntityId): Record<string, unknown> | null {
    return this.store.get(entityKey(entityType, entityId))?.entity ?? null;
  }

  /** Every entity snapshot, keyed — for convergence assertions across devices. */
  allEntities(): Readonly<Record<string, Record<string, unknown>>> {
    const out: Record<string, Record<string, unknown>> = {};
    for (const [key, state] of this.store) {
      out[key] = state.entity;
    }
    return out;
  }
}

type StoredState = {
  version: number;
  entity: Record<string, unknown>;
  pending: LocalPendingChange | null;
  blocked: boolean;
};

/** `entityKey` — composite `{entityType}:{entityId}` wire key. */
function entityKey(entityType: string, entityId: EntityId): string {
  return `${entityType}:${entityId}`;
}
