import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { CenterHoursRepository } from '../../../src/ports/center-hours-repository';
import type { CenterHours, CenterHoursId } from '../../../src/entities/center-hours';
import type { CenterCode } from '../../../src/value-objects/ids';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';

/**
 * In-memory {@link CenterHoursRepository} for unit tests. Reuses the shared
 * soft-deletable base and adds the two center-scoped reads; both exclude
 * tombstones, mirroring what the SQLite adapter's `deleted_at IS NULL` filters do.
 */
export class InMemoryCenterHoursRepository
  extends InMemorySoftDeletableRepository<CenterHoursId, CenterHours>
  implements CenterHoursRepository
{
  async listForCenter(centerCode: CenterCode): Promise<readonly CenterHours[]> {
    return this.all()
      .filter((row) => row.centerCode === centerCode && row.deletedAt === null)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  }

  async findByDay(centerCode: CenterCode, dayOfWeek: WeekdayIndex): Promise<CenterHours | null> {
    return (
      this.all().find(
        (row) =>
          row.centerCode === centerCode && row.dayOfWeek === dayOfWeek && row.deletedAt === null,
      ) ?? null
    );
  }
}
