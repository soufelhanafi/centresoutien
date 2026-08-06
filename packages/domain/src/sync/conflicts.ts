import type { ChangeLogOp } from './change-log-writer';
import type { DeviceId, EntityId, UserId } from '../value-objects/ids';

/**
 * The things the sync engine cannot settle alone — what lands in the conflict
 * popup / "conflits en attente" inbox (SOU-80 §5). The engine never resolves a
 * `SyncConflict` by itself: auto-merge handles the majority of cases silently,
 * and everything here requires a human click. `version` + the hub's push check
 * decide ordering; the `at` timestamps below are display context only.
 */

/** One side of a conflict — who / when / what, for the popup. */
export type ConflictSide = {
  readonly updatedBy: UserId;
  readonly deviceId: DeviceId;
  readonly op: ChangeLogOp;
  /** Per-device monotonic sequence — reliable intra-device ordering. */
  readonly seq: number;
  /** Display context ("when", relative UTC). Never a merge criterion. */
  readonly at: Date;
  readonly changedFields: readonly string[];
  /** Full snapshot, so "take my version" / "take their version" are trivial. */
  readonly entity: Readonly<Record<string, unknown>>;
};

/**
 * Two devices edited the SAME domain fields from the same base. The engine
 * auto-merged every field only one side touched; only `fields` need a human.
 * Per-field resolution (mine for the phone, theirs for the address) is a UI
 * concern — this object carries both full snapshots plus per-side change logs.
 */
export type FieldClash = {
  readonly kind: 'field-clash';
  readonly entityType: string;
  readonly entityId: EntityId;
  /** The canonical version both sides were based on when the clash was seen. */
  readonly version: number;
  /** The clashing domain field names. */
  readonly fields: readonly string[];
  readonly mine: ConflictSide;
  readonly theirs: ConflictSide;
};

/**
 * One device soft-deleted an entity while another edited it (either direction).
 * Signals a real-world misunderstanding between staff, not a data race — so it
 * is NEVER auto-resolved in either direction. It gets its own tab in the popup.
 */
export type DeleteVsEdit = {
  readonly kind: 'delete-vs-edit';
  readonly entityType: string;
  readonly entityId: EntityId;
  readonly mine: ConflictSide;
  readonly theirs: ConflictSide;
};

/**
 * Two live records in the same center probably name the same person — the
 * duplicate-detection tier of the resolve step. Parents/teachers anchor on the
 * E.164 phone, students on normalized name + guardian. Executing the actual
 * merge (re-pointing dependents in one transaction) is the `MergeParents` /
 * `MergeStudents` use cases' job (SOU-92); the engine only ever surfaces the
 * pair. `exact` is "match with high confidence" (still a human-confirmed merge,
 * never a blind one); `fuzzy` is "flag for review".
 */
export type ProbableDuplicate = {
  readonly kind: 'probable-duplicate';
  readonly entityType: string;
  /** The record that stays / wins the merge. */
  readonly keptId: EntityId;
  /** The record that would be retired into `keptId`. */
  readonly candidateId: EntityId;
  readonly tier: 'exact' | 'fuzzy';
  /** Stable token the renderer maps to a localized reason: same-name-phone, shared-phone, shared-guardian, separated-family. */
  readonly reason: string;
};

export type SyncConflict = FieldClash | DeleteVsEdit | ProbableDuplicate;

/** A stable identity for de-duplicating repeated conflict detections across retries. */
export function conflictKey(conflict: SyncConflict): string {
  switch (conflict.kind) {
    case 'field-clash':
      return `field-clash:${conflict.entityType}:${conflict.entityId}:${conflict.fields.join(',')}`;
    case 'delete-vs-edit':
      return `delete-vs-edit:${conflict.entityType}:${conflict.entityId}`;
    case 'probable-duplicate':
      return `probable-duplicate:${conflict.entityType}:${conflict.keptId}:${conflict.candidateId}`;
  }
}
