import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';
import type { ParentId } from './parent';

/** ULID id prefix for students: `stu_01HW…`. */
export const STUDENT_ID_PREFIX = 'stu';

export type StudentId = Brand<string, 'StudentId'>;

// `ParentId` / `PARENT_ID_PREFIX` now live in `./parent` (their real home, SOU-40).
// Re-exported here so existing `from './entities/student'` imports keep resolving.
export { PARENT_ID_PREFIX } from './parent';
export type { ParentId } from './parent';

/**
 * A student enrolled at the center (every-plan `core.students`). People-like, so
 * it carries a `naturalKey` — a *matching* key for the parents-first duplicate
 * engine (SOU-92), never a hard business constraint. Soft-delete only.
 *
 * `guardianIds` is the many-to-many link to guardians (Parents). It lives on the
 * student as a single field so it syncs as one entry in the change log; SOU-40
 * builds the Parent entity and SOU-42 the bidirectional linking UI on top.
 */
export type Student = EntityEnvelope & {
  readonly id: StudentId;
  /**
   * `centerCode :: normalizedName :: birthDate`, stamped at creation and never
   * recomputed — even when the name is later edited — so sync matching stays
   * stable. Immutable by convention (there is no edit path that rewrites it).
   */
  readonly naturalKey: string;
  name: { fr: string; ar: string };
  birthDate: string; // 'YYYY-MM-DD'
  level: string; // grade label, center-defined (e.g. '2 Bac SM', '3AC')
  school: string | null; // external school the student attends; null when unknown
  notes: string | null; // free-form notes; null when none
  guardianIds: readonly ParentId[]; // links to guardians (Parents); empty until linked
  /**
   * Set ONLY on the loser tombstone of a `MergeStudents` (SOU-92): the id of the
   * surviving record this one was folded into. Absent/null on a never-merged
   * (live) record, and never set on the winner. Kept on the entity (not a
   * separate join table) so it rides the change log as one scalar field and the
   * data layer maps it to a single `merged_into_id` column later.
   */
  mergedIntoId?: StudentId | null;
};
