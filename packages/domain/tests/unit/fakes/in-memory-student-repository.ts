import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { StudentRepository } from '../../../src/ports/student-repository';
import type { Student, StudentId } from '../../../src/entities/student';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link StudentRepository} for unit tests. Inherits the soft-deletable
 * base and adds the two Student-specific reads, mirroring the semantics the
 * SQLite adapter must uphold: both exclude tombstones and scope to a center.
 */
export class InMemoryStudentRepository
  extends InMemorySoftDeletableRepository<StudentId, Student>
  implements StudentRepository
{
  async findByNaturalKey(centerCode: CenterCode, naturalKey: string): Promise<readonly Student[]> {
    return this.all().filter(
      (student) =>
        student.deletedAt === null &&
        student.centerCode === centerCode &&
        student.naturalKey === naturalKey,
    );
  }

  async countActive(centerCode: CenterCode): Promise<number> {
    return this.all().filter(
      (student) => student.deletedAt === null && student.centerCode === centerCode,
    ).length;
  }
}
