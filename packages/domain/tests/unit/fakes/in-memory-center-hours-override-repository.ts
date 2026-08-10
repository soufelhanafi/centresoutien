import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { CenterHoursOverrideRepository } from '../../../src/ports/center-hours-override-repository';
import type {
  CenterHoursOverride,
  CenterHoursOverrideId,
} from '../../../src/entities/center-hours-override';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link CenterHoursOverrideRepository} for unit tests. Reuses the
 * shared soft-deletable base and adds the two center-scoped reads; both exclude
 * tombstones and order by range start then id, mirroring the SQLite adapter.
 */
export class InMemoryCenterHoursOverrideRepository
  extends InMemorySoftDeletableRepository<CenterHoursOverrideId, CenterHoursOverride>
  implements CenterHoursOverrideRepository
{
  async listForCenter(centerCode: CenterCode): Promise<readonly CenterHoursOverride[]> {
    return this.all()
      .filter((row) => row.centerCode === centerCode && row.deletedAt === null)
      .sort(byStartThenId);
  }

  async listOverlapping(
    centerCode: CenterCode,
    rangeStart: string,
    rangeEnd: string,
  ): Promise<readonly CenterHoursOverride[]> {
    return this.all()
      .filter(
        (row) =>
          row.centerCode === centerCode &&
          row.deletedAt === null &&
          row.dateRange.start <= rangeEnd &&
          row.dateRange.end >= rangeStart,
      )
      .sort(byStartThenId);
  }
}

function byStartThenId(a: CenterHoursOverride, b: CenterHoursOverride): number {
  if (a.dateRange.start !== b.dateRange.start) {
    return a.dateRange.start < b.dateRange.start ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
