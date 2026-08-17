import type { NiveauId } from '../entities/niveau';

/**
 * Publishes the *shape* the `ArchiveNiveau` in-use guard depends on. The
 * concrete adapter (`SqliteNiveauReference`) is a composite over the three
 * tables that can reference a niveau — `students.niveau_id`,
 * `groups.niveau_id`, and `teachers.niveau_ids` (JSON membership) — wired at
 * the composition root, mirroring how the group repository backs
 * `SubjectReferencePort`.
 *
 * "In use" means: at least one non-soft-deleted reference points at this
 * niveau. A niveau with any such reference cannot be archived.
 */
export interface NiveauReferencePort {
  /** True when at least one live student, group, or teacher references the niveau. */
  isNiveauInUse(niveauId: NiveauId): Promise<boolean>;
}
