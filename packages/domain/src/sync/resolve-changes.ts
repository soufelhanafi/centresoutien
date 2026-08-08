import type { Clock } from '../ports/clock';
import type { HubChange } from '../ports/sync-hub-port';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import type { SyncConflict } from './conflicts';
import { conflictKey } from './conflicts';
import type { DuplicateMatcher } from './duplicate-matcher';
import { isPeopleEntityType } from './duplicate-matcher';
import { ImmutableDivergenceError } from '../errors/sync-errors';
import { resolveInboundChange, type ResolveOutcome } from './merge';
import type { LocalPendingChange, LocalSyncRepository } from './sync-local-repository';
import {
  SUBJECT_ENTITY_TYPE,
  subjectCodeCollisionKey,
  type SubjectCodeCollision,
  type SubjectCodeCollisionStore,
} from './subject-code-collision';
import { resolveSubjectCodeCollision } from '../policies/subject-code-collision-policy';

/**
 * The resolve step of pull → resolve → push (SOU-80 §3), kept out of the engine
 * so both stay under the size ceiling. Pure field-level 3-way merge, delete-vs-edit
 * and same-field clashes to a human, probable duplicates flagged — never
 * auto-resolved. Version-skip makes re-deliveries idempotent across retries.
 *
 * A clashing write is `blockPending`'d and stays in the local change log — that
 * blocked write is the durable conflict record. `resolveBatch` only surfaces the
 * clashes seen in THIS run; re-surfacing persisted conflicts after a restart is
 * the resolve-conflict use case's job (SOU-92), which reads blocked writes.
 */
export class ChangeResolver {
  constructor(
    private readonly local: LocalSyncRepository,
    private readonly clock: Clock,
    private readonly deviceId: DeviceId,
    private readonly updatedBy: UserId,
    private readonly centreId: CenterCode,
    private readonly subjectCollisions: SubjectCodeCollisionStore | null = null,
  ) {}

  /** Apply or merge each inbound change; queue conflicts; never auto-resolve them. */
  resolveBatch(
    changes: readonly HubChange[],
    conflicts: SyncConflict[],
    matcher: DuplicateMatcher,
    collisions: SubjectCodeCollision[] = [],
  ): number {
    let applied = 0;
    for (const change of changes) {
      applied += this.resolveOne(change, conflicts, matcher, collisions);
    }
    return applied;
  }

  private resolveOne(
    change: HubChange,
    conflicts: SyncConflict[],
    matcher: DuplicateMatcher,
    collisions: SubjectCodeCollision[],
  ): number {
    const state = this.local.getLocalState(change.entityType, change.entityId);
    if (state && change.version <= state.version) return 0; // already applied (retry re-delivery)

    const local = state?.pending ?? null;
    const outcome = resolveInboundChange({
      entityType: change.entityType,
      entityId: change.entityId,
      local,
      inbound: change,
    });

    switch (outcome.kind) {
      case 'apply':
        this.applyInbound(change, outcome, collisions);
        break;
      case 'merged':
        this.local.upsertPending(this.buildMergedPending(change, local, outcome));
        break;
      case 'conflict':
        this.local.blockPending(change.entityType, change.entityId, outcome.conflict);
        this.pushUniqueConflict(conflicts, outcome.conflict);
        break;
      case 'immutable-divergence':
        // Locked decisions never fork and never get a popup: block the pending
        // write and abort the whole sync loudly rather than apply anything.
        this.local.blockPending(change.entityType, change.entityId);
        throw new ImmutableDivergenceError(change.entityType, change.entityId);
    }

    this.detectDuplicates(change, conflicts, matcher);
    return outcome.kind === 'apply' || outcome.kind === 'merged' ? 1 : 0;
  }

  /**
   * Fast-forward apply, made collision-safe for subjects (SOU-122). A subject
   * apply projects onto the real `subjects` table, which carries the partial
   * unique index `ux_subjects_code`; two replicas can each have created a live
   * subject with the same code offline, so a raw apply would throw
   * `SQLITE_CONSTRAINT_UNIQUE`. Instead the clash is settled deterministically —
   * the lower ULID keeps the code, the loser's code is nulled — so the apply
   * never throws and both rows survive. Non-subjects (and tombstone applies,
   * which the partial index excludes) take the plain path.
   */
  private applyInbound(
    change: HubChange,
    outcome: Extract<ResolveOutcome, { kind: 'apply' }>,
    collisions: SubjectCodeCollision[],
  ): void {
    const code = outcome.entity['code'];
    // Guard mirrors the `ux_subjects_code` predicate exactly (code IS NOT NULL
    // AND deleted_at IS NULL) so the collision path covers every apply the index
    // could reject — narrowed inline rather than via a bundled boolean so TS
    // proves `subjectCollisions` and `code` without a cast (CLAUDE.md §13).
    if (
      this.subjectCollisions === null ||
      change.entityType !== SUBJECT_ENTITY_TYPE ||
      outcome.entity['deletedAt'] != null ||
      typeof code !== 'string'
    ) {
      this.local.applyInbound(change.entityType, change.entityId, outcome.entity, outcome.version);
      return;
    }

    const store = this.subjectCollisions;
    const existingId = store.findLiveSubjectIdByCode(this.centreId, code, change.entityId);
    if (existingId === null) {
      this.local.applyInbound(change.entityType, change.entityId, outcome.entity, outcome.version);
      return;
    }

    const { winnerId, loserId } = resolveSubjectCodeCollision(change.entityId, existingId);
    if (loserId === change.entityId) {
      // Inbound loses: apply it with its code freed; the local winner is untouched.
      this.local.applyInbound(
        change.entityType,
        change.entityId,
        { ...outcome.entity, code: null },
        outcome.version,
      );
    } else {
      // Inbound wins: free the code from the local loser first so the winner's
      // projection cannot violate the unique index, then apply the winner as-is.
      store.clearSubjectCode(existingId);
      this.local.applyInbound(change.entityType, change.entityId, outcome.entity, outcome.version);
    }
    this.pushUniqueCollision(collisions, {
      entityType: SUBJECT_ENTITY_TYPE,
      code,
      winnerId,
      loserId,
    });
  }

  private buildMergedPending(
    change: HubChange,
    local: LocalPendingChange | null,
    outcome: Extract<ResolveOutcome, { kind: 'merged' }>,
  ): Parameters<LocalSyncRepository['upsertPending']>[0] {
    const now = this.clock.now();
    const merged = { ...outcome.entity };
    merged['version'] = outcome.baseVersion;
    merged['updatedAt'] = now;
    merged['updatedBy'] = this.updatedBy;
    return {
      entityType: change.entityType,
      entityId: change.entityId,
      deviceId: this.deviceId,
      entity: merged,
      changedFields: outcome.changedFields,
      baseVersion: outcome.baseVersion,
      op: local?.op ?? 'update',
      updatedBy: this.updatedBy,
      at: now,
    };
  }

  /**
   * Flag probable duplicates for inbound creates of people-like entities. The
   * matcher only detects (parents-first, phone anchor; students, name+guardian);
   * executing a merge is the Merge use cases' job (SOU-92).
   *
   * Detection iterates the batch in feed order today. When SOU-92 wires actual
   * merges, inbound people creates must be processed parents → teachers →
   * students so cross-entity resolution can rely on parents being settled first.
   */
  private detectDuplicates(
    change: HubChange,
    conflicts: SyncConflict[],
    matcher: DuplicateMatcher,
  ): void {
    if (change.op !== 'create' || !isPeopleEntityType(change.entityType)) {
      return;
    }
    for (const match of matcher.match({
      entityType: change.entityType,
      centerCode: this.centreId,
      entity: change.entity,
      selfId: change.entityId,
    })) {
      // keptId = the pre-existing record that stays; candidateId = this newer
      // inbound record that would be retired into it once SOU-92 merges.
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
    const key = conflictKey(conflict);
    if (conflicts.some((existing) => conflictKey(existing) === key)) return;
    conflicts.push(conflict);
  }

  private pushUniqueCollision(
    collisions: SubjectCodeCollision[],
    collision: SubjectCodeCollision,
  ): void {
    const key = subjectCodeCollisionKey(collision);
    if (collisions.some((existing) => subjectCodeCollisionKey(existing) === key)) return;
    collisions.push(collision);
  }
}
