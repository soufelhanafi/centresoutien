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
 * shared soft-deletable base; both reads exclude tombstones and mirror the
 * SQLite adapter's greatest-id-wins duplicate resolution.
 */
export class InMemoryTeacherAvailabilityRepository
  extends InMemorySoftDeletableRepository<TeacherAvailabilityId, TeacherAvailability>
  implements TeacherAvailabilityRepository
{
  async findByTeacher(centerCode: CenterCode, teacherId: TeacherId): Promise<TeacherAvailability | null> {
    const live = (await this.listForCenter(centerCode)).filter((row) => row.teacherId === teacherId);
    return live[live.length - 1] ?? null;
  }

  async listForCenter(centerCode: CenterCode): Promise<readonly TeacherAvailability[]> {
    return this.all()
      .filter((row) => row.centerCode === centerCode && row.deletedAt === null)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
}
