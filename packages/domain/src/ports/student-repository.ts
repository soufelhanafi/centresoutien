import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Student, StudentId } from '../entities/student';
import type { CenterCode } from '../value-objects/ids';

/**
 * Persistence port for Students. Extends the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`) with two
 * Student-specific reads:
 *
 * - `findByNaturalKey` — the fast exact-match tier of the parents-first duplicate
 *   engine (SOU-92). It returns **every** live match because the key is a matching
 *   hint, not a uniqueness constraint: the same name + birth date can legitimately
 *   recur across families, so those cases are flagged, never blocked.
 * - `countActive` — the live headcount the plan student limit checks against.
 * - `listActive` — every live (non-tombstoned) student of the center, for the
 *   list screen. Search/sort are applied by the `ListStudents` use case, not here:
 *   the port stays a dumb tenant-scoped read.
 */
export interface StudentRepository extends SoftDeletableRepository<StudentId, Student> {
  findByNaturalKey(centerCode: CenterCode, naturalKey: string): Promise<readonly Student[]>;
  countActive(centerCode: CenterCode): Promise<number>;
  listActive(centerCode: CenterCode): Promise<readonly Student[]>;
}
