import type { Brand } from '../value-objects/brand';
import type { PhoneNumber } from '../value-objects/phone-number';
import type { GuardianRelation } from '../value-objects/guardian-relation';
import type { EntityEnvelope } from './envelope';

/** ULID id prefix for parents/guardians: `prt_01HW…`. */
export const PARENT_ID_PREFIX = 'prt';

export type ParentId = Brand<string, 'ParentId'>;

/**
 * A parent or legal guardian of one or more students. The **anchor of
 * parents-first duplicate matching** (`sync-safe-entities`): `phone` is required
 * and stored E.164-normalized, and `naturalKey` is derived from it. A family may
 * legitimately share one phone across two guardians — that is a *matching* signal
 * flagged later, never a save-time rejection, so phone is deliberately NOT unique.
 *
 * People-like, so it carries `naturalKey` (stamped once at creation, immutable).
 * `relation` is an enum token only — the FR/AR labels live in the renderer i18n.
 * Full sync envelope; soft-delete only, never hard-deleted.
 */
export type Parent = EntityEnvelope & {
  readonly id: ParentId;
  /** Matching key for duplicate detection — immutable after creation. */
  readonly naturalKey: string;
  name: string;
  phone: PhoneNumber;
  email: string | null;
  relation: GuardianRelation;
  whatsappOptIn: boolean;
  /**
   * Set ONLY on the loser tombstone of a `MergeParents` (SOU-92): the id of the
   * surviving record this one was folded into. Absent/null on a never-merged
   * (live) record, and never set on the winner. Kept on the entity (not a
   * separate join table) so it rides the change log as one scalar field and the
   * data layer maps it to a single `merged_into_id` column later.
   */
  mergedIntoId?: ParentId | null;
};
