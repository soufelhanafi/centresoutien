import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Subject, SubjectId } from '../entities/subject';
import type { CenterCode } from '../value-objects/ids';

/**
 * Persistence port for Subjects. Extends the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`; reads exclude
 * tombstones, no hard delete) with the code-uniqueness lookup `CreateSubject`
 * needs. Subjects are identified by relationships, not people-like matching, so
 * there is no `findByNaturalKey`.
 */
export interface SubjectRepository extends SoftDeletableRepository<SubjectId, Subject> {
  /**
   * The live (non-tombstoned) subject in this center whose `code` equals `code`,
   * or null. Backs the per-center code-uniqueness guard in `CreateSubject`. The
   * `code` is already normalized (trimmed + uppercased) by the caller. Center-scoped:
   * never matches another tenant's subject.
   */
  findByCode(centerCode: CenterCode, code: string): Promise<Subject | null>;
}
