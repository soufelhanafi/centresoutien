import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';
import type { EntityId } from '../value-objects/ids';

/** ULID id prefix for merge-log entries: `mrg_01HW…`. */
export const MERGE_LOG_ID_PREFIX = 'mrg';

export type MergeLogId = Brand<string, 'MergeLogId'>;

/** Which people-entity type a merge joined — the two merge use cases (SOU-92). */
export type MergeLogEntityType = 'parents' | 'students';

/**
 * Why two records were merged. Mirrors {@link import('../sync/conflicts').DuplicateReason}
 * plus `manual` for an admin-driven merge from the UI. Deliberately a
 * self-contained union (not an import of the sync module) so the entity layer
 * never depends on the sync layer.
 */
export type MergeLogReason =
  | 'same-name-phone'
  | 'shared-phone'
  | 'shared-guardian'
  | 'separated-family'
  | 'manual';

/**
 * A single, immutable audit entry for one merge of two people-like records
 * (sync-safe-entities step 8): the winner keeps its `id`, the loser gets a
 * `deletedAt` tombstone + `mergedIntoId`, and this entry records who / when /
 * why so a later undo or audit can reconstruct what happened. Written by the
 * merge use cases in the SAME unit of work as the merge itself — a merge that
 * committed without its log entry would be unauditable, so the merge
 * unit-of-work ports carry this entry into their atomic transaction.
 *
 * Append-only, like {@link Payment}: every field is `readonly`, there is no
 * update path, and the repository port exposes no delete. `deletedAt` exists
 * only for envelope uniformity and is never set. `version` is still hub-assigned
 * for cursor ordering so merge history syncs like any other row. The loser and
 * winner ids are stored as the generic {@link EntityId} — the entry must record
 * either a parent or a student pair, and `EntityId` is the one audited widening
 * the id system provides for type-agnostic storage.
 */
export type MergeLogEntry = EntityEnvelope & {
  readonly id: MergeLogId;
  /** The merged record's kind — `'parents'` or `'students'`. */
  readonly entityType: MergeLogEntityType;
  /** The id that was retired into the winner (now a tombstone). */
  readonly loserId: EntityId;
  /** The id that survived the merge and absorbed the loser's dependents. */
  readonly winnerId: EntityId;
  /** Why the merge happened — the duplicate-detection reason or `manual`. */
  readonly reason: MergeLogReason;
  /** Free-form human context (e.g. "parente confirmée par l'accueil"), optional. */
  readonly note: string | null;
};
