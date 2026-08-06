import type { Clock } from '../ports/clock';
import type { HubChange } from '../ports/sync-hub-port';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import type { SyncConflict } from './conflicts';
import { conflictKey } from './conflicts';
import type { DuplicateMatcher } from './duplicate-matcher';
import { PEOPLE_ENTITY_TYPES } from './duplicate-matcher';
import { resolveInboundChange } from './merge';
import type { LocalSyncRepository } from './sync-local-repository';

/**
 * The resolve step of pull → resolve → push (SOU-80 §3), kept out of the engine
 * so both stay under the size ceiling. Pure field-level 3-way merge, delete-vs-edit
 * and same-field clashes to a human, probable duplicates flagged — never
 * auto-resolved. Version-skip makes re-deliveries idempotent across retries.
 */
export class ChangeResolver {
  constructor(
    private readonly local: LocalSyncRepository,
    private readonly clock: Clock,
    private readonly deviceId: DeviceId,
    private readonly updatedBy: UserId,
    private readonly centreId: CenterCode,
  ) {}

  /** Apply or merge each inbound change; queue conflicts; never auto-resolve them. */
  resolveBatch(
    changes: readonly HubChange[],
    conflicts: SyncConflict[],
    matcher: DuplicateMatcher,
  ): number {
    let applied = 0;
    for (const change of changes) {
      const state = this.local.getLocalState(change.entityType, change.entityId);
      if (state && change.version <= state.version) continue; // already applied (retry re-delivery)

      const local = state?.pending ?? null;
      const outcome = resolveInboundChange({
        entityType: change.entityType,
        entityId: change.entityId,
        local,
        inbound: change,
      });

      switch (outcome.kind) {
        case 'apply':
          this.local.applyInbound(change.entityType, change.entityId, outcome.entity, outcome.version);
          applied++;
          break;
        case 'merged': {
          const merged = { ...outcome.entity } as Record<string, unknown>;
          merged['version'] = outcome.baseVersion;
          merged['updatedAt'] = this.clock.now();
          merged['updatedBy'] = this.updatedBy;
          this.local.upsertPending({
            entityType: change.entityType,
            entityId: change.entityId,
            deviceId: this.deviceId,
            entity: merged,
            changedFields: outcome.changedFields,
            baseVersion: outcome.baseVersion,
            op: local?.op ?? 'update',
            updatedBy: this.updatedBy,
            at: this.clock.now(),
          });
          applied++;
          break;
        }
        case 'conflict':
          this.local.blockPending(change.entityType, change.entityId);
          this.pushUniqueConflict(conflicts, outcome.conflict);
          break;
      }

      this.detectDuplicates(change, conflicts, matcher);
    }
    return applied;
  }

  /**
   * Flag probable duplicates for inbound creates of people-like entities. The
   * matcher only detects (parents-first, phone anchor; students, name+guardian);
   * executing a merge is the Merge use cases' job (SOU-92).
   */
  private detectDuplicates(
    change: HubChange,
    conflicts: SyncConflict[],
    matcher: DuplicateMatcher,
  ): void {
    if (change.op !== 'create' || !PEOPLE_ENTITY_TYPES.includes(change.entityType as never)) {
      return;
    }
    for (const match of matcher.match({
      entityType: change.entityType,
      centerCode: this.centreId,
      entity: change.entity,
      selfId: change.entityId,
    })) {
      this.pushUniqueConflict(conflicts, {
        kind: 'probable-duplicate',
        entityType: change.entityType,
        keptId: match.candidateId,
        candidateId: change.entityId,
        tier: match.tier,
        reason: match.reason,
      });
    }
  }

  private pushUniqueConflict(conflicts: SyncConflict[], conflict: SyncConflict): void {
    if (conflicts.some((existing) => conflictKey(existing) === conflictKey(conflict))) return;
    conflicts.push(conflict);
  }
}
