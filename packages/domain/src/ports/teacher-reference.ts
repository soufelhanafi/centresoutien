import type { TeacherId } from '../entities/teacher';

/**
 * ⚠️ DECLARED CONTRACT ONLY — NO REAL ADAPTER IN SOU-36.
 *
 * Publishes the *shape* the `ArchiveTeacher` in-use guard depends on so the guard
 * is fully testable now (against an in-memory fake) while the real backing is
 * still on the roadmap. A teacher is referenced once Groups (SOU-48), sessions,
 * or payroll rules (SOU-70) point at them; those tickets own the concrete query
 * and wire it into `ArchiveTeacher` at the composition root then, with no change
 * to this contract or to the use case. Until then the composition root injects a
 * stub reporting "never referenced" — the same declared-only pattern as
 * `RoomReferencePort` (SOU-32 → SOU-53).
 *
 * "Referenced" means: at least one non-soft-deleted Group / session / payroll rule
 * names this teacher. A teacher with any such reference cannot be archived.
 */
export interface TeacherReferencePort {
  /** True when at least one active group/session/payroll rule references the teacher. */
  hasReferencesForTeacher(teacherId: TeacherId): Promise<boolean>;
}
