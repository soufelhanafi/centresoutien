import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { EnrollmentRepository } from '../../../src/ports/enrollment-repository';
import type { Enrollment, EnrollmentId } from '../../../src/entities/enrollment';
import type { GroupId } from '../../../src/entities/group';
import type { StudentId } from '../../../src/entities/student';
import type { EntityId, UserId } from '../../../src/value-objects/ids';

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

  async listInactiveByGroup(groupId: GroupId): Promise<readonly Enrollment[]> {
    return this.all().filter((e) => e.deletedAt !== null && e.groupId === groupId);
  }

  async listInactiveByFormerTeacher(teacherId: EntityId): Promise<readonly Enrollment[]> {
    return this.all().filter(
      (e) => e.deletedAt !== null && e.unenrolledUnderTeacherId === teacherId,
    );
  }

  /**
   * Mirrors the SQLite adapter: soft-delete plus a former-teacher snapshot in one
   * write, guarded on a live row (`deletedAt === null`) so a concurrent second
   * unenroll cannot overwrite the first snapshot.
   */
  async softDeleteUnderTeacher(
    id: EnrollmentId,
    at: Date,
    by: UserId,
    teacherId: EntityId | null,
  ): Promise<void> {
    const row = this.rows.get(id);
    if (!row || row.deletedAt !== null) return;
    row.deletedAt = at;
    row.updatedAt = at;
    row.updatedBy = by;
    row.unenrolledUnderTeacherId = teacherId;
  }

  async listActiveByStudent(studentId: StudentId): Promise<readonly Enrollment[]> {
    return this.all().filter((e) => e.deletedAt === null && e.studentId === studentId);
  }

  async countActiveByGroup(groupId: GroupId): Promise<number> {
    return this.all().filter((e) => e.deletedAt === null && e.groupId === groupId).length;
  }

  /**
   * Mirrors the SQLite `GROUP BY`: a group with zero live rows is **absent** from
   * the map (never a 0 entry), so the caller's default-to-0 path is exercised.
   */
  async countActiveByGroups(groupIds: readonly GroupId[]): Promise<ReadonlyMap<GroupId, number>> {
    const counts = new Map<GroupId, number>();
    for (const groupId of groupIds) {
      const n = this.all().filter((e) => e.deletedAt === null && e.groupId === groupId).length;
      if (n > 0) counts.set(groupId, n);
    }
    return counts;
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
