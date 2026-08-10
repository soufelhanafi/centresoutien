import type { Clock } from '../../../src/ports/clock';
import type { DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import type { ConflictSide } from '../../../src/sync/conflicts';
import type { SessionDedupStore } from '../../../src/sync/session-dedup';
import type { InMemorySyncLocalRepository } from './in-memory-sync-local-repository';

/**
 * In-memory {@link SessionDedupStore} over the in-memory shadow repo, mirroring
 * the SQLite adapter's semantics (SOU-188 / SOU-194). The in-memory repo has no
 * unique-index constraint, so `absorbSessionAsWinner` / `retireInboundSession`
 * record the settled winner/loser as applied — a faithful stand-in for the
 * physical in-place rewrite. `resolveSessionNaturalKey` retires the loser
 * (clearing any block under it) and stores the human's choice as a pending push
 * under the winner id, exactly like the SQLite transaction.
 */
export class InMemorySessionDedupStore implements SessionDedupStore {
  constructor(
    private readonly local: InMemorySyncLocalRepository,
    private readonly clock: Clock,
    private readonly deviceId: DeviceId,
  ) {}

  findSessionByNaturalKey(
    recurringSessionId: string,
    date: string,
    excludeId: EntityId,
  ): { id: EntityId; deletedAt: string | null } | null {
    for (const entity of Object.values(this.local.allEntities())) {
      const id = entity['id'];
      if (
        String(id ?? '').startsWith('ses_') &&
        id !== excludeId &&
        entity['recurringSessionId'] === recurringSessionId &&
        entity['date'] === date
      ) {
        return {
          id: id as EntityId,
          deletedAt: entity['deletedAt'] == null ? null : String(entity['deletedAt']),
        };
      }
    }
    return null;
  }

  lastLocalSide(entityId: EntityId): ConflictSide | null {
    const state = this.local.getLocalState('sessions', entityId);
    if (!state) return null;
    return {
      updatedBy: state.entity['updatedBy'] as UserId,
      deviceId: this.deviceId,
      op: state.entity['deletedAt'] == null ? 'update' : 'delete',
      seq: 0,
      at: this.clock.now(),
      changedFields: [],
      entity: state.entity,
    };
  }

  absorbSessionAsWinner(input: {
    fromId: EntityId;
    toId: EntityId;
    entity: Record<string, unknown>;
    version: number;
  }): void {
    this.local.applyInbound('sessions', input.toId, input.entity, input.version);
  }

  retireInboundSession(input: {
    keptId: EntityId;
    retiredId: EntityId;
    entity: Record<string, unknown>;
    version: number;
  }): void {
    this.local.applyInbound('sessions', input.retiredId, input.entity, input.version);
  }

  resolveSessionNaturalKey(input: {
    fromId: EntityId;
    winnerId: EntityId;
    loserId: EntityId;
    entity: Record<string, unknown>;
    inboundVersion: number;
    baseVersion: number;
    op: 'create' | 'update' | 'delete';
    changedFields: readonly string[];
    updatedBy: UserId;
    at: Date;
  }): void {
    if (input.fromId !== input.winnerId) {
      this.local.applyInbound('sessions', input.winnerId, input.entity, input.baseVersion);
    }
    this.local.applyInbound(
      'sessions',
      input.loserId,
      { ...input.entity, id: input.loserId },
      input.inboundVersion,
    );
    this.local.upsertPending({
      entityType: 'sessions',
      entityId: input.winnerId,
      deviceId: this.deviceId,
      entity: input.entity,
      changedFields: input.changedFields,
      baseVersion: input.baseVersion,
      op: input.op,
      updatedBy: input.updatedBy,
      at: input.at,
    });
  }
}
