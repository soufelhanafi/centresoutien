import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Enrollment, EnrollmentId } from '../entities/enrollment';
import type { GroupId } from '../entities/group';
import type { StudentId } from '../entities/student';

/**
 * Persistence port for Enrollments. Inherits the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`); reads exclude
 * tombstones, and there is no hard delete. Enrollments are identified by their
 * relationships, not people-like matching, so there is no `findByNaturalKey`.
 *
 * The extra reads back the group/student detail screens and the runtime seat-full
 * guard. "Active" here means a **live** (non-tombstoned) enrollment row — an
 * unenrolled student's row is soft-deleted and no longer counted. `endMonth` is
 * lifecycle metadata and is not consulted by these reads in SOU-121.
 *
 * The SQLite adapter and its migration land in a paired follow-up (mirroring the
 * SOU-32 domain → SOU-33 repo split); `EnrollStudent` needs `save` +
 * `countActiveByGroup`, and `UnenrollStudent` needs `findById` + `softDelete`.
 */
export interface EnrollmentRepository
  extends SoftDeletableRepository<EnrollmentId, Enrollment> {
  /** Live enrollments in the group (for the group roster). */
  listActiveByGroup(groupId: GroupId): Promise<readonly Enrollment[]>;
  /** Live enrollments the student holds (for the student detail sheet). */
  listActiveByStudent(studentId: StudentId): Promise<readonly Enrollment[]>;
  /** Live seat count in the group — the number the capacity guard checks against. */
  countActiveByGroup(groupId: GroupId): Promise<number>;
}
