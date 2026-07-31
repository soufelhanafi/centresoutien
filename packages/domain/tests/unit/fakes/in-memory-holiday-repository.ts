import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { HolidayRepository } from '../../../src/ports/holiday-repository';
import type { Holiday, HolidayId } from '../../../src/entities/holiday';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link HolidayRepository} for unit tests. Inherits the soft-deletable
 * surface from the shared base and adds the Holiday-specific reads (list/archived
 * lookup), mirroring the semantics the SQLite adapter must uphold:
 * `listActive` sees only live rows, `listArchived`/`findArchivedById` see only
 * tombstones, all scoped to the given center.
 */
export class InMemoryHolidayRepository
  extends InMemorySoftDeletableRepository<HolidayId, Holiday>
  implements HolidayRepository
{
  async listActive(centerCode: CenterCode): Promise<readonly Holiday[]> {
    return this.all().filter((h) => h.centerCode === centerCode && h.deletedAt === null);
  }

  async listArchived(centerCode: CenterCode): Promise<readonly Holiday[]> {
    return this.all().filter((h) => h.centerCode === centerCode && h.deletedAt !== null);
  }

  async findArchivedById(id: HolidayId): Promise<Holiday | null> {
    return this.all().find((h) => h.id === id && h.deletedAt !== null) ?? null;
  }
}
