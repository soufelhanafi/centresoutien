import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { TeacherRepository } from '../../../src/ports/teacher-repository';
import type { Teacher, TeacherId } from '../../../src/entities/teacher';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link TeacherRepository} for unit tests. Extends the shared
 * soft-deletable base and adds the `findByNaturalKey`, `countActive`,
 * `listActive`, `listArchived`, and `findArchivedById` reads — which, like the
 * SQLite adapter, scope to a center and split live rows from tombstones
 * (`listActive`/`countActive`/`findByNaturalKey` see only live rows;
 * `listArchived`/`findArchivedById` see only tombstones).
 */
export class InMemoryTeacherRepository
  extends InMemorySoftDeletableRepository<TeacherId, Teacher>
  implements TeacherRepository
{
  async findByNaturalKey(naturalKey: string): Promise<Teacher | null> {
    const hit = this.all().find((t) => t.naturalKey === naturalKey && t.deletedAt === null);
    return hit ?? null;
  }

  async countActive(centerCode: CenterCode): Promise<number> {
    return this.all().filter(
      (teacher) => teacher.deletedAt === null && teacher.centerCode === centerCode,
    ).length;
  }

  async listActive(centerCode: CenterCode): Promise<readonly Teacher[]> {
    return this.all().filter(
      (teacher) => teacher.deletedAt === null && teacher.centerCode === centerCode,
    );
  }

  async listArchived(centerCode: CenterCode): Promise<readonly Teacher[]> {
    return this.all().filter(
      (teacher) => teacher.deletedAt !== null && teacher.centerCode === centerCode,
    );
  }

  async findArchivedById(id: TeacherId): Promise<Teacher | null> {
    return this.all().find((teacher) => teacher.id === id && teacher.deletedAt !== null) ?? null;
  }
}
