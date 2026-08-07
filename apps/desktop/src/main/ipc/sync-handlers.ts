import type {
  SyncEngine,
  DuplicateMatcher,
  ResolveConflict,
  SyncResult,
  SyncConflict,
  ConflictSide,
  DeviceId,
  UserId,
  EntityId,
  LocalSyncRepository,
} from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';

export type SyncEngineRunner = Pick<SyncEngine, 'run'>;
export type ResolveConflictUseCase = Pick<ResolveConflict, 'execute'>;
export type ListBlockedConflicts = () => readonly SyncConflict[];

export type SyncHandlerDeps = {
  /** Runs one pull → resolve → push cycle against the wired hub, or null when
   *  no hub is configured (the sync page then shows a "not paired" state). */
  syncEngine: SyncEngineRunner | null;
  /** The duplicate matcher source backing the sync engine's people dedup. */
  matcher: DuplicateMatcher | null;
  resolveConflict: ResolveConflictUseCase;
  /** Durable "conflits en attente" — blocked conflicts survive restart. */
  listBlockedConflicts: ListBlockedConflicts;
  /** The device-side sync store; the e2e-only seed writes through it. */
  localSyncRepository: LocalSyncRepository;
  deviceId: () => DeviceId;
  updatedBy: () => UserId;
};

/**
 * Sync IPC handlers (SOU-91). `sync.run` drives the wired engine (or reports
 * "no hub" to the renderer via a null result — pairing UX is a later ticket);
 * `sync.conflicts.list` re-surfaces the durable blocked-conflict inbox;
 * `sync.conflict.resolve` settles one clash a human already decided on. The
 * handlers only wire DTOs — all conflict semantics live in the domain.
 */
export function createSyncHandlers(deps: SyncHandlerDeps): Pick<
  IpcHandlers,
  'sync.run' | 'sync.conflicts.list' | 'sync.conflict.resolve' | 'sync.test.seedConflict'
> {
  return {
    'sync.run': async () => {
      if (deps.syncEngine === null || deps.matcher === null) {
        return { result: null };
      }
      const result: SyncResult = await deps.syncEngine.run(deps.matcher);
      return {
        result: {
          status: result.status,
          applied: result.applied,
          pushed: result.pushed,
          conflicts: result.conflicts.map(toConflictView),
          deviceClockSkew: result.deviceClockSkew,
          resolutionPermission: result.resolutionPermission,
        },
      };
    },
    'sync.conflicts.list': () => ({
      conflicts: deps.listBlockedConflicts().map(toConflictView),
    }),
    'sync.conflict.resolve': async (request) => {
      // The domain `ResolveConflict` use case is the real permission gate —
      // this handler just forwards the human's choice.
      await deps.resolveConflict.execute({
        entityType: request.entityType,
        entityId: request.entityId as EntityId,
        deviceId: deps.deviceId(),
        updatedBy: deps.updatedBy(),
        resolution: request.resolution,
      });
      return { ok: true };
    },
    'sync.test.seedConflict': (request) => {
      // E2E-only seam (SOU-91): writes one blocked field-clash through the
      // app's own repository connection, so a spec never opens the encrypted
      // DB from a second process. This handler is only wired in `--mode e2e`
      // builds (see handlers.ts) — absent in production exactly like `plan.set`.
      const conflict: SyncConflict = {
        kind: 'field-clash',
        entityType: request.entityType,
        entityId: request.entityId as EntityId,
        version: request.version,
        fields: [...request.fields],
        mine: {
          updatedBy: deps.updatedBy(),
          deviceId: deps.deviceId(),
          op: 'update',
          seq: 1,
          at: new Date(),
          changedFields: [...request.fields],
          entity: request.mineEntity,
        },
        theirs: {
          updatedBy: 'usr_0000000000000000000000000A' as UserId,
          deviceId: 'dev_0000000000000000000000000A' as DeviceId,
          op: 'update',
          seq: 2,
          at: new Date(),
          changedFields: [...request.fields],
          entity: request.theirsEntity,
        },
      };
      deps.localSyncRepository.upsertPending({
        entityType: request.entityType,
        entityId: request.entityId as EntityId,
        deviceId: deps.deviceId(),
        entity: request.mineEntity,
        changedFields: [...request.fields],
        baseVersion: request.version,
        op: 'update',
        updatedBy: deps.updatedBy(),
        at: new Date(),
      });
      deps.localSyncRepository.blockPending(request.entityType, request.entityId as EntityId, conflict);
      return { ok: true };
    },
  };
}

/** Project a SyncConflict to its boundary DTO — Dates to ISO strings. */
function toConflictView(conflict: SyncConflict) {
  switch (conflict.kind) {
    case 'field-clash':
      return {
        kind: conflict.kind,
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        version: conflict.version,
        fields: [...conflict.fields],
        mine: toSideView(conflict.mine),
        theirs: toSideView(conflict.theirs),
      };
    case 'delete-vs-edit':
      return {
        kind: conflict.kind,
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        version: conflict.version,
        mine: toSideView(conflict.mine),
        theirs: toSideView(conflict.theirs),
      };
    case 'probable-duplicate':
      return {
        kind: conflict.kind,
        entityType: conflict.entityType,
        keptId: conflict.keptId,
        candidateId: conflict.candidateId,
        tier: conflict.tier,
        reason: conflict.reason,
      };
  }
}

function toSideView(side: ConflictSide) {
  return {
    updatedBy: side.updatedBy,
    deviceId: side.deviceId,
    op: side.op,
    changedFields: [...side.changedFields],
    at: side.at.toISOString(),
    entity: side.entity,
  };
}
