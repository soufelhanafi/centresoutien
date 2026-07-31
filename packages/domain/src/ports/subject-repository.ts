import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Subject, SubjectId } from '../entities/subject';
import type { CenterCode } from '../value-objects/ids';

/**
 * A subject paired with its in-use reference count — the read model that backs the
 * CRUD table (SOU-47). `inUseCount` is the number of active references to the
 * subject; `canDelete` is derived (`inUseCount === 0`) so the UI can enable or
 * disable the archive action without a second round-trip. "In use" today means
 * active (non-tombstoned) groups; sessions and formulas join the count later
 * (they carry no `subjectId` yet). The mirror invariant is the `ArchiveSubject`
 * guard: `canDelete === false` is exactly when `SubjectReferencePort.isSubjectInUse`
 * would report `true`.
 */
export type SubjectUsage = {
  readonly subject: Subject;
  readonly inUseCount: number;
  readonly canDelete: boolean;
};

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

  /**
   * Every live subject of the center paired with its in-use reference count, in a
   * single round-trip. Excludes tombstoned subjects; the count excludes tombstoned
   * references. Center-scoped: never counts another tenant's references. Backs the
   * SOU-47 CRUD table's per-row archive affordance.
   */
  listWithUsage(centerCode: CenterCode): Promise<readonly SubjectUsage[]>;
}
