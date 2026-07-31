import type { Brand } from '../value-objects/brand';
import type { PhoneNumber } from '../value-objects/phone-number';
import type { SubjectId } from './subject';
import type { EntityEnvelope } from './envelope';

/** ULID id prefix for teachers: `tch_01HW…`. */
export const TEACHER_ID_PREFIX = 'tch';

export type TeacherId = Brand<string, 'TeacherId'>;

/**
 * A teacher the center schedules into groups and pays monthly (every-plan
 * `core.teachers`). People-like, so it carries a `naturalKey` — the fast
 * exact-match tier of the parents-first duplicate engine (`sync-safe-entities`).
 * The anchor is the E.164 `phone`, exactly like Parent: `phone` is required and
 * stored canonical (`normalizePhone`), and the key mixes it with the name so two
 * teachers sharing a number but with different names both save. Soft-delete only;
 * a teacher is never hard-deleted.
 *
 * `name` is bilingual `{ fr, ar }` (unlike Parent, whose name is a single
 * string) so both scripts render natively — the same shape as `Student.name`.
 * `cin` (Moroccan national ID card) and `email` are optional (`null` when unset).
 *
 * `subjectIds` is the many-to-many link to the subjects this teacher teaches. It
 * lives on the entity as a single field — mirroring `Student.guardianIds` — so it
 * syncs as one entry in the change log; no junction table. The referenced
 * Subjects' existence is not enforced here (a matching hint, like guardian links);
 * SOU-48 (Group) is where subject↔teacher assignment becomes load-bearing.
 *
 * `active` mirrors `Room.active` / `Subject.active`: it is set `true` on creation
 * and reserved for a future "temporarily unavailable" toggle. A teacher's
 * live/archived lifecycle is driven solely by the envelope `deletedAt` tombstone
 * (archive), never by this flag.
 */
export type Teacher = EntityEnvelope & {
  readonly id: TeacherId;
  /** Matching key for duplicate detection — immutable after creation. */
  readonly naturalKey: string;
  name: { fr: string; ar: string };
  cin: string | null;
  phone: PhoneNumber;
  email: string | null;
  subjectIds: readonly SubjectId[];
  active: boolean;
};
