import type { SubjectId } from '../entities/subject';

/**
 * Publishes the *shape* the `ArchiveSubject` in-use guard depends on. The concrete
 * adapter landed in SOU-46 and is the live-`groups` counting query (the group
 * repository, which owns `subject_id`): it is wired into `ArchiveSubject` at the
 * composition root, mirroring how the session repository backs `RoomReferencePort`.
 *
 * "In use" means: at least one non-soft-deleted reference points at this subject.
 * Today that is an active Group; sessions and formulas join the query when those
 * references exist (`WeeklyRecurringSession` has no `subjectId` yet, and `Formula`
 * is not built) — a scope extension behind this stable contract, with no change to
 * the port or to `ArchiveSubject`. A subject with any such reference cannot be
 * archived.
 */
export interface SubjectReferencePort {
  /** True when at least one active group, session, or formula references the subject. */
  isSubjectInUse(subjectId: SubjectId): Promise<boolean>;
}
