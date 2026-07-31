import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { EnrollmentRepository } from '../../../src/ports/enrollment-repository';
import type { Enrollment, EnrollmentId } from '../../../src/entities/enrollment';
import type { GroupId } from '../../../src/entities/group';
import type { StudentId } from '../../../src/entities/student';

/**
 * In-memory {@link EnrollmentRepository} for unit tests. Inherits the soft-deletable
 * base and adds the enrollment-specific reads, mirroring the semantics the SQLite
 * adapter must uphold: all exclude tombstones. "Active" = a live enrollment row.
 */
export class InMemoryEnrollmentRepository
  extends InMemorySoftDeletableRepository<EnrollmentId, Enrollment>
  implements EnrollmentRepository
{
  async listActiveByGroup(groupId: GroupId): Promise<readonly Enrollment[]> {
    return this.all().filter((e) => e.deletedAt === null && e.groupId === groupId);
  }

  async listActiveByStudent(studentId: StudentId): Promise<readonly Enrollment[]> {
    return this.all().filter((e) => e.deletedAt === null && e.studentId === studentId);
  }

  async countActiveByGroup(groupId: GroupId): Promise<number> {
    return this.all().filter((e) => e.deletedAt === null && e.groupId === groupId).length;
  }
}
