import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { TeacherAvailabilityRepository } from '../../../src/ports/teacher-availability-repository';
import type {
  TeacherAvailability,
  TeacherAvailabilityId,
} from '../../../src/entities/teacher-availability';
import type { TeacherId } from '../../../src/entities/teacher';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link TeacherAvailabilityRepository} for unit tests. Reuses the
 * shared soft-deletable base; both reads exclude tombstones, mirroring the
 * SQLite adapter's at-most-one-live-row-per-teacher semantics.
 */
export class InMemoryTeacherAvailabilityRepository
  extends InMemorySoftDeletableRepository<TeacherAvailabilityId, TeacherAvailability>
  implements TeacherAvailabilityRepository
{
  async findByTeacher(centerCode: CenterCode, teacherId: TeacherId): Promise<TeacherAvailability | null> {
    return (
      this.all().find(
        (row) => row.centerCode === centerCode && row.teacherId === teacherId && row.deletedAt === null,
      ) ?? null
    );
  }

  async listForCenter(centerCode: CenterCode): Promise<readonly TeacherAvailability[]> {
    return this.all().filter((row) => row.centerCode === centerCode && row.deletedAt === null);
  }
}
