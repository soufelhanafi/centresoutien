import type { EntityId } from '../value-objects/ids';
import { DomainError } from './plan-errors';

/**
 * Thrown when a device that is older than the hub tries to sync (SOU-80).
 * Push carries the device schema version; the hub rejects a device whose schema
 * is older than its own because it could not round-trip the entity shapes
 * another device already wrote. Additive-only migrations keep *pull* safe (the
 * device ignores unknown fields), so a too-old device can still read — it just
 * cannot write until it updates. The renderer maps the stable `schema-too-old`
 * code to "mise à jour requise".
 */
export class SchemaTooOldError extends DomainError {
  readonly code = 'schema-too-old';

  constructor(
    readonly deviceSchema: number,
    readonly requiredSchema: number,
  ) {
    super(
      `App schema v${deviceSchema} is older than the hub's v${requiredSchema}. Update required.`,
    );
  }
}

/**
 * Thrown when the hub reports a push `accepted` but omits the assigned version
 * for an entity that was pushed — a contract violation, not a retryable race.
 * Silently skipping it would leave the write pending forever and re-pushed on
 * every cycle, so the protocol is treated as broken the moment it happens.
 * `entityKey` is a composite `{entityType}:{entityId}` (ULIDs only, no PII).
 */
export class SyncProtocolError extends DomainError {
  readonly code = 'sync-protocol';

  constructor(readonly entityKey: string) {
    super(
      `Sync protocol violation: hub accepted the push but returned no version for "${entityKey}".`,
    );
  }
}

/**
 * Thrown when the resolve step finds an edit touching a protected field of an
 * immutable entity (invoices, formulas, teacher_payouts) — a locked decision
 * that must never fork across devices. There is no merge and no popup: the
 * pending write is blocked and the whole sync aborts loudly, so the hub's
 * canonical state wins on the next clean sync.
 */
export class ImmutableDivergenceError extends DomainError {
  readonly code = 'immutable-divergence';

  constructor(
    readonly entityType: string,
    readonly entityId: EntityId,
  ) {
    super(
      `Immutable "${entityType}" entity "${entityId}" diverged across devices. Sync aborted; the pending edit must be discarded.`,
    );
  }
}

/**
 * Thrown by `ResolveConflict` when the requested clash is not in the local
 * "conflits en attente" store — it was already settled, or the renderer asked
 * for one that was never blocked (including a probable-duplicate, which is
 * merged via `MergeParents`/`MergeStudents`, never resolved field-by-field).
 * The renderer maps the stable `conflict-not-found` code to a toast.
 */
export class ConflictNotFoundError extends DomainError {
  readonly code = 'conflict-not-found';

  constructor(
    readonly entityType: string,
    readonly entityId: EntityId,
  ) {
    super(`No blocked sync conflict for ${entityType} ${entityId}.`);
  }
}

/**
 * Thrown by `ResolveConflict` when a delete-vs-edit clash (which has no fields —
 * it is a two-way choice between whole snapshots) is asked to resolve per-field.
 * The popup must never offer per-field controls on the delete-vs-edit tab.
 */
export class ConflictNotPerFieldResolvableError extends DomainError {
  readonly code = 'conflict-not-per-field-resolvable';

  constructor(
    readonly entityType: string,
    readonly entityId: EntityId,
  ) {
    super(`Delete-vs-edit conflict ${entityType} ${entityId} cannot be resolved per-field.`);
  }
}
