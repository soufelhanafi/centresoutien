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

  async hasActiveEnrollment(studentId: StudentId, groupId: GroupId): Promise<boolean> {
    return this.all().some(
      (e) => e.deletedAt === null && e.studentId === studentId && e.groupId === groupId,
    );
  }

  /**
   * Atomic in the single-threaded test harness: the JS body runs to completion
   * without yielding, mirroring the SQLite adapter's one-transaction guarantee.
   * Inserts only when no live `(studentId, groupId)` exists; tombstones do not block.
   */
  async saveIfAbsent(enrollment: Enrollment): Promise<boolean> {
    if (await this.hasActiveEnrollment(enrollment.studentId, enrollment.groupId)) {
      return false;
    }
    await this.save(enrollment);
    return true;
  }
}
