import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { RoomRepository } from '../../../src/ports/room-repository';
import type { Room, RoomId } from '../../../src/entities/room';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link RoomRepository} for unit tests. Inherits the soft-deletable
 * surface from the shared base and adds the Room-specific reads (list/count/
 * archived lookup), mirroring the semantics the SQLite adapter must uphold:
 * `listActive`/`countActive` see only live rows, `listArchived`/`findArchivedById`
 * see only tombstones, all scoped to the given center.
 */
export class InMemoryRoomRepository
  extends InMemorySoftDeletableRepository<RoomId, Room>
  implements RoomRepository
{
  async listActive(centerCode: CenterCode): Promise<readonly Room[]> {
    return this.all().filter((r) => r.centerCode === centerCode && r.deletedAt === null);
  }

  async listArchived(centerCode: CenterCode): Promise<readonly Room[]> {
    return this.all().filter((r) => r.centerCode === centerCode && r.deletedAt !== null);
  }

  async countActive(centerCode: CenterCode): Promise<number> {
    return (await this.listActive(centerCode)).length;
  }

  async findArchivedById(id: RoomId): Promise<Room | null> {
    return this.all().find((r) => r.id === id && r.deletedAt !== null) ?? null;
  }
}
