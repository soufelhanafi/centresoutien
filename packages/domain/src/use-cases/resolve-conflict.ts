import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { SyncConflict } from '../sync/conflicts';
import type { LocalSyncRepository } from '../sync/sync-local-repository';
import type { ChangeLogOp } from '../sync/change-log-writer';
import { ConflictNotFoundError, ConflictNotPerFieldResolvableError } from '../errors/sync-errors';
import type { DeviceId, EntityId, UserId } from '../value-objects/ids';

/**
 * A human's decision on one unresolved sync conflict — the "conflits en
 * attente" inbox action (SOU-80 §5). The engine never resolves a clash itself;
 * `SyncEngine` surfaces it, `ResolveConflict` settles it. Each choice produces
 * a fresh pending write with a new change-log revision based on the conflict's
 * canonical `version`, so once pushed it wins deterministically on every
 * device's next pull — never by wall clock.
 */
export type ConflictResolution =
  /** Keep the local write exactly as-is — "Prendre ma version". */
  | { readonly choice: 'take-mine' }
  /** Adopt the other device's write — "Prendre leur version". */
  | { readonly choice: 'take-theirs' }
  /**
   * Field-by-field: which side wins per clashing field. Fields not listed keep
   * the local ("mine") value — the clashing fields are the only ones the popup
   * offers, and the local snapshot already holds every non-clashing field.
   */
  | {
      readonly choice: 'per-field';
      /** Maps a clashing field name to the side that wins it. */
      readonly fields: Readonly<Record<string, 'mine' | 'theirs'>>;
    };

export type ResolveConflictInput = {
  entityType: string;
  entityId: EntityId;
  deviceId: DeviceId;
  updatedBy: UserId;
  resolution: ConflictResolution;
};

/**
 * Settles one blocked sync conflict that a human already decided on in the
 * conflict popup / inbox. Reads the stored conflict off the local sync store
 * (the durable record of the clash), applies the choice, and writes the outcome
 * as a fresh pending change based on the conflict's canonical version — so the
 * next push is accepted and wins everywhere. Throws `ConflictNotFoundError` when
 * the conflict was already resolved or never blocked.
 */
export class ResolveConflict {
  constructor(
    private readonly local: LocalSyncRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ResolveConflictInput): Promise<void> {
    this.plan.require('sync.conflict-resolution');
    const conflict = this.findBlocked(input.entityType, input.entityId);
    const resolved = this.buildResolvedEntity(conflict, input.resolution);
    const now = this.clock.now();
    this.local.resolveBlocked({
      entityType: input.entityType,
      entityId: input.entityId,
      entity: resolved.entity,
      changedFields: resolved.changedFields,
      baseVersion: resolved.baseVersion,
      op: resolved.op,
      updatedBy: input.updatedBy,
      at: now,
    });
  }

  /**
   * Only field-clashes and delete-vs-edit have an `entityId` and are settleable
   * here — probable-duplicates are merged via MergeParents / MergeStudents
   * (SOU-92), never resolved field-by-field.
   */
  private findBlocked(entityType: string, entityId: EntityId): SyncConflict {
    for (const conflict of this.local.listBlocked()) {
      if (conflict.kind === 'probable-duplicate') continue;
      if (conflict.entityType === entityType && conflict.entityId === entityId) return conflict;
    }
    throw new ConflictNotFoundError(entityType, entityId);
  }

  private buildResolvedEntity(
    conflict: SyncConflict,
    resolution: ConflictResolution,
  ): { entity: Record<string, unknown>; changedFields: readonly string[]; op: ChangeLogOp; baseVersion: number } {
    switch (conflict.kind) {
      case 'probable-duplicate':
        // Duplicates are merged via MergeParents / MergeStudents (SOU-92), not
        // resolved field-by-field — this use case only settles same-field
        // clashes and delete-vs-edit.
        throw new ConflictNotFoundError(conflict.entityType, conflict.keptId);
      case 'delete-vs-edit':
        return this.resolveDeleteVsEdit(conflict, resolution);
      case 'field-clash':
        return this.resolveFieldClash(conflict, resolution);
    }
  }

  private resolveFieldClash(
    conflict: Extract<SyncConflict, { kind: 'field-clash' }>,
    resolution: ConflictResolution,
  ): { entity: Record<string, unknown>; changedFields: readonly string[]; op: ChangeLogOp; baseVersion: number } {
    const mine = conflict.mine.entity;
    const theirs = conflict.theirs.entity;
    const chosen: Record<string, unknown> = {};
    for (const field of conflict.fields) {
      const side = pickFieldSide(resolution, field);
      chosen[field] = side === 'theirs' ? theirs[field] : mine[field];
    }
    return {
      entity: { ...mine, ...chosen, version: conflict.version },
      changedFields: [...conflict.fields],
      op: 'update',
      baseVersion: conflict.version,
    };
  }

  private resolveDeleteVsEdit(
    conflict: Extract<SyncConflict, { kind: 'delete-vs-edit' }>,
    resolution: ConflictResolution,
  ): { entity: Record<string, unknown>; changedFields: readonly string[]; op: ChangeLogOp; baseVersion: number } {
    // Delete-vs-edit has no per-field choice — the human picks a side outright.
    if (resolution.choice === 'per-field') {
      throw new ConflictNotPerFieldResolvableError(conflict.entityType, conflict.entityId);
    }
    if (resolution.choice === 'take-theirs') {
      // Their edit (or their delete) wins: adopt their snapshot, but the local
      // write must survive as the new pending so it is pushed and wins.
      return { entity: { ...conflict.theirs.entity, version: conflict.version }, changedFields: [], op: conflict.theirs.op, baseVersion: conflict.version };
    }
    // Keep the local delete (or local edit) — re-base onto the canonical version.
    return { entity: { ...conflict.mine.entity, version: conflict.version }, changedFields: [], op: conflict.mine.op, baseVersion: conflict.version };
  }
}

function pickFieldSide(resolution: ConflictResolution, field: string): 'mine' | 'theirs' {
  if (resolution.choice === 'take-mine') return 'mine';
  if (resolution.choice === 'take-theirs') return 'theirs';
  return resolution.fields[field] ?? 'mine';
}
