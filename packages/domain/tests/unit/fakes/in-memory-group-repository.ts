import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { GroupRepository } from '../../../src/ports/group-repository';
import type { Group, GroupId } from '../../../src/entities/group';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link GroupRepository} for unit tests. Inherits the soft-deletable
 * surface from the shared base and adds the Group-specific reads (list/archived
 * lookup), mirroring the semantics the SQLite adapter must uphold: `listActive`
 * sees only live rows, `listArchived`/`findArchivedById` see only tombstones, all
 * scoped to the given center.
 */
export class InMemoryGroupRepository
  extends InMemorySoftDeletableRepository<GroupId, Group>
  implements GroupRepository
{
  async listActive(centerCode: CenterCode): Promise<readonly Group[]> {
    return this.all().filter((g) => g.centerCode === centerCode && g.deletedAt === null);
  }

  async listArchived(centerCode: CenterCode): Promise<readonly Group[]> {
    return this.all().filter((g) => g.centerCode === centerCode && g.deletedAt !== null);
  }

  async findArchivedById(id: GroupId): Promise<Group | null> {
    return this.all().find((g) => g.id === id && g.deletedAt !== null) ?? null;
  }
}
