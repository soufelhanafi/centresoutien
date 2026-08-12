import type { Clock } from '../ports/clock';
import type { HubChange } from '../ports/sync-hub-port';
import type { CenterCode, DeviceId, EntityId, UserId } from '../value-objects/ids';
import type { SyncConflict, ConflictSide } from './conflicts';
import { conflictKey } from './conflicts';
import type { DuplicateMatcher } from './duplicate-matcher';
import { isPeopleEntityType } from './duplicate-matcher';
import { ImmutableDivergenceError } from '../errors/sync-errors';
import { resolveInboundChange, type ResolveOutcome } from './merge';
import type { LocalPendingChange, LocalSyncRepository } from './sync-local-repository';
import { valuesEqual } from './change-log';
import { ENVELOPE_FIELD_NAMES } from '../entities/envelope';
import {
  SUBJECT_ENTITY_TYPE,
  subjectCodeCollisionKey,
  type SubjectCodeCollision,
  type SubjectCodeCollisionStore,
} from './subject-code-collision';
import { resolveSubjectCodeCollision } from '../policies/subject-code-collision-policy';
import {
  SESSION_ENTITY_TYPE,
  sessionDedupKey,
  type SessionDedup,
  type SessionDedupStore,
} from './session-dedup';
import { resolveSessionCollision } from '../policies/session-collision-policy';
import {
  PAYMENT_ENTITY_TYPE,
  detectReversalDedups,
  reversalDedupKey,
  type PaymentReversalDedupStore,
  type ReversalDedup,
} from './reversal-dedup';
import type { Payment, PaymentId } from '../entities/payment';

type ReversalPayment = Payment & { readonly kind: 'reversal'; readonly reversesPaymentId: PaymentId };

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
    private readonly sessionDedups: SessionDedupStore | null = null,
    private readonly reversalDedups: PaymentReversalDedupStore | null = null,
  ) {}

  /** Apply or merge each inbound change; queue conflicts; never auto-resolve them. */
  resolveBatch(
    changes: readonly HubChange[],
    conflicts: SyncConflict[],
    matcher: DuplicateMatcher,
    collisions: SubjectCodeCollision[] = [],
    dedups: SessionDedup[] = [],
    reversalDedups: ReversalDedup[] = [],
  ): number {
    let applied = 0;
    for (const change of changes) {
      applied += this.resolveOne(change, conflicts, matcher, collisions, dedups, reversalDedups);
    }
    return applied;
  }

  private resolveOne(
    change: HubChange,
    conflicts: SyncConflict[],
    matcher: DuplicateMatcher,
    collisions: SubjectCodeCollision[],
    dedups: SessionDedup[],
    reversalDedups: ReversalDedup[],
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

    let applied = false;
    switch (outcome.kind) {
      case 'apply':
        applied = this.applyInbound(change, outcome, conflicts, collisions, dedups, reversalDedups);
        break;
      case 'merged':
        this.local.upsertPending(this.buildMergedPending(change, local, outcome));
        applied = true;
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
    return applied ? 1 : 0;
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
    conflicts: SyncConflict[],
    collisions: SubjectCodeCollision[],
    dedups: SessionDedup[],
    reversalDedups: ReversalDedup[],
  ): boolean {
    this.detectReversalDedups(change, outcome, reversalDedups);

    // Sessions first: a natural-key collision with a DIFFERENT local row settles
    // deterministically when both sides agree (lower ULID wins, in-place rewrite)
    // so the projected `ux_sessions_recurrence_date` index never throws. But a
    // deleted-state disagreement (one replica cancelled the occurrence, the other
    // kept it) or an unsynced local edit on the occupied row is a HUMAN decision
    // — absorb would rewrite the local row and silently discard the user's choice,
    // so route to a conflict instead.
    const sessionStore = this.sessionDedups;
    const recurringSessionId = outcome.entity['recurringSessionId'];
    const date = outcome.entity['date'];
    if (
      sessionStore !== null &&
      change.entityType === SESSION_ENTITY_TYPE &&
      typeof recurringSessionId === 'string' &&
      typeof date === 'string'
    ) {
      const occupied = sessionStore.findSessionByNaturalKey(recurringSessionId, date, change.entityId);
      if (occupied !== null) {
        const inboundDeleted = outcome.entity['deletedAt'] != null;
        const occupiedDeleted = occupied.deletedAt !== null;
        // A pending write here is normally the materialization itself (redundant
        // with the winner — deterministic generator → identical fields) and must
        // NOT block convergence. Only a divergence between the local pending
        // entity and the inbound — i.e. a user edit beyond creation — is a
        // decision absorb must not discard.
        const localPending = this.local.getLocalState(SESSION_ENTITY_TYPE, occupied.id)?.pending ?? null;
        const divergingFields =
          localPending !== null ? divergingDomainFields(localPending.entity, outcome.entity) : [];
        const localBlocked = this.local
          .listBlocked()
          .some(
            (c) =>
              c.entityType === SESSION_ENTITY_TYPE &&
              (c.kind === 'probable-duplicate'
                ? c.keptId === occupied.id || c.candidateId === occupied.id
                : c.entityId === occupied.id),
          );

        if (localBlocked) return false; // preserve the queued conflict; re-deliver later
        if (inboundDeleted !== occupiedDeleted || divergingFields.length > 0) {
          const conflict = this.sessionCollisionConflict(
            change,
            occupied.id,
            inboundDeleted,
            occupiedDeleted,
            divergingFields,
          );
          this.local.blockPending(SESSION_ENTITY_TYPE, occupied.id, conflict);
          this.pushUniqueConflict(conflicts, conflict);
          return false;
        }

        const { winnerId, loserId } = resolveSessionCollision(change.entityId, occupied.id);
        if (loserId === change.entityId) {
          sessionStore.retireInboundSession({
            keptId: occupied.id,
            retiredId: change.entityId,
            entity: outcome.entity,
            version: outcome.version,
          });
        } else {
          sessionStore.absorbSessionAsWinner({
            fromId: occupied.id,
            toId: change.entityId,
            entity: outcome.entity,
            version: outcome.version,
          });
        }
        this.pushUniqueDedup(dedups, {
          entityType: SESSION_ENTITY_TYPE,
          recurringSessionId,
          date,
          winnerId,
          loserId,
        });
        return true;
      }
    }

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
      return true;
    }

    const store = this.subjectCollisions;
    const existingId = store.findLiveSubjectIdByCode(this.centreId, code, change.entityId);
    if (existingId === null) {
      this.local.applyInbound(change.entityType, change.entityId, outcome.entity, outcome.version);
      return true;
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
    return true;
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

  private pushUniqueDedup(dedups: SessionDedup[], dedup: SessionDedup): void {
    const key = sessionDedupKey(dedup);
    if (dedups.some((existing) => sessionDedupKey(existing) === key)) return;
    dedups.push(dedup);
  }

  private pushUniqueReversalDedup(dedups: ReversalDedup[], dedup: ReversalDedup): void {
    const key = reversalDedupKey(dedup);
    if (dedups.some((existing) => reversalDedupKey(existing) === key)) return;
    dedups.push(dedup);
  }

  private detectReversalDedups(
    change: HubChange,
    outcome: Extract<ResolveOutcome, { kind: 'apply' }>,
    dedups: ReversalDedup[],
  ): void {
    const store = this.reversalDedups;
    const inbound = paymentFromEntity(change.entityId, outcome.entity);
    if (store === null || change.entityType !== PAYMENT_ENTITY_TYPE || inbound === null) return;
    const local = store.findPaymentReversalByTarget(inbound.reversesPaymentId, change.entityId);
    if (local === null) return;
    for (const dedup of detectReversalDedups([local, inbound])) {
      this.pushUniqueReversalDedup(dedups, dedup);
    }
  }

  /**
   * The conflict a natural-key collision becomes when it cannot settle
   * automatically (SOU-188): a deleted-state disagreement is a delete-vs-edit —
   * one replica cancelled the occurrence, the other kept it — which is never
   * auto-resolved in either direction; an unsynced local edit on the occupied
   * row is a field-clash, because absorbing would rewrite that row and silently
   * discard the user's edit. Keyed on the LOCAL occupied row — the durable
   * shadow entry the "conflits en attente" inbox re-surfaces.
   */
  private sessionCollisionConflict(
    change: HubChange,
    localId: EntityId,
    inboundDeleted: boolean,
    occupiedDeleted: boolean,
    fields: readonly string[],
  ): SyncConflict {
    const localState = this.local.getLocalState(SESSION_ENTITY_TYPE, localId);
    const localPending = localState?.pending ?? null;
    const theirs = inboundSide(change);
    const mine = localPending
      ? pendingSide(localPending)
      : (this.sessionDedups?.lastLocalSide(localId) ?? {
          updatedBy: this.updatedBy,
          deviceId: this.deviceId,
          op: occupiedDeleted ? ('delete' as const) : ('update' as const),
          seq: 0,
          at: this.clock.now(),
          changedFields: [],
          entity: localState?.entity ?? change.entity,
        });
    if (inboundDeleted !== occupiedDeleted) {
      return {
        kind: 'delete-vs-edit',
        entityType: SESSION_ENTITY_TYPE,
        entityId: localId,
        version: change.version,
        mine,
        theirs,
      };
    }
    return {
      kind: 'field-clash',
      entityType: SESSION_ENTITY_TYPE,
      entityId: localId,
      version: change.version,
      fields,
      mine,
      theirs,
    };
  }
}

function paymentFromEntity(entityId: EntityId, entity: Record<string, unknown>): ReversalPayment | null {
  if (entity['kind'] !== 'reversal' || typeof entity['reversesPaymentId'] !== 'string') return null;
  if (typeof entity['invoiceId'] !== 'string') return null;
  if (typeof entity['amountMad'] !== 'number') return null;
  if (typeof entity['method'] !== 'string') return null;
  if (typeof entity['paidOn'] !== 'string') return null;
  return {
    id: String(entityId) as PaymentId,
    centerCode: entity['centerCode'] as CenterCode,
    deviceOrigin: entity['deviceOrigin'] as DeviceId,
    createdAt: entity['createdAt'] instanceof Date ? entity['createdAt'] : new Date(entity['createdAt'] as string),
    updatedAt: entity['updatedAt'] instanceof Date ? entity['updatedAt'] : new Date(entity['updatedAt'] as string),
    updatedBy: entity['updatedBy'] as UserId,
    deletedAt: entity['deletedAt'] == null ? null : new Date(entity['deletedAt'] as string),
    version: typeof entity['version'] === 'number' ? entity['version'] : 0,
    invoiceId: entity['invoiceId'] as Payment['invoiceId'],
    kind: 'reversal',
    amountMad: entity['amountMad'],
    method: entity['method'] as Payment['method'],
    paidOn: entity['paidOn'],
    reversesPaymentId: entity['reversesPaymentId'] as PaymentId,
    note: typeof entity['note'] === 'string' ? entity['note'] : null,
  };
}

/** Mirrors merge.ts `side(…, 'theirs')` so the two stay in sync. */
function inboundSide(change: HubChange): ConflictSide {
  return {
    updatedBy: change.updatedBy,
    deviceId: change.deviceId,
    op: change.op,
    seq: change.deviceSeq,
    at: change.receivedAt,
    changedFields: change.changedFields,
    entity: change.entity,
  };
}

/** Mirrors merge.ts `side(…, 'mine')` so the two stay in sync. */
function pendingSide(pending: LocalPendingChange): ConflictSide {
  return {
    updatedBy: pending.updatedBy,
    deviceId: pending.deviceId,
    op: pending.op,
    seq: pending.seq,
    at: pending.at,
    changedFields: pending.changedFields,
    entity: pending.entity,
  };
}

/**
 * The non-envelope fields whose value differs between the local pending entity
 * and the inbound entity — the user edits absorb would discard. Empty when the
 * two are the same materialization (deterministic generator → identical fields).
 * Identity + envelope bookkeeping (incl. `id`, which the envelope set omits) can
 * never count — they differ by construction across replicas.
 */
function divergingDomainFields(
  local: Readonly<Record<string, unknown>>,
  inbound: Readonly<Record<string, unknown>>,
): readonly string[] {
  const excluded = new Set<string>(['id', ...ENVELOPE_FIELD_NAMES]);
  const allFields = new Set([...Object.keys(local), ...Object.keys(inbound)]);
  const diverging: string[] = [];
  for (const field of allFields) {
    if (excluded.has(field)) continue;
    if (!valuesEqual(local[field], inbound[field])) diverging.push(field);
  }
  return diverging;
}
