import type { SubjectId } from '../entities/subject';

/**
 * ⚠️ DECLARED CONTRACT ONLY — NO ADAPTER IN SOU-45.
 *
 * Publishes the *shape* the `ArchiveSubject` in-use guard depends on so the guard
 * is fully testable now (against an in-memory fake) while the real implementation
 * is still on the roadmap. None of the three referencing entities can point at a
 * Subject yet — `Group` and `Formula` do not exist, and `WeeklyRecurringSession`
 * has no `subjectId` — so the concrete adapter (a query across live groups,
 * sessions, and formulas) lands when those references exist. It is wired into
 * `ArchiveSubject` at the composition root then, with no change to this contract
 * or to the use case. Same declared-only pattern as SOU-32's `RoomReferencePort`.
 *
 * "In use" means: at least one non-soft-deleted Group, Session, or Formula
 * references this subject. A subject with any such reference cannot be archived.
 */
export interface SubjectReferencePort {
  /** True when at least one active group, session, or formula references the subject. */
  isSubjectInUse(subjectId: SubjectId): Promise<boolean>;
}
