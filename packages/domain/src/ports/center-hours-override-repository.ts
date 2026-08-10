import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type {
  CenterHoursOverride,
  CenterHoursOverrideId,
} from '../entities/center-hours-override';
import type { CenterCode } from '../value-objects/ids';

/**
 * Persistence port for center-hours overrides (SOU-165). Inherits the
 * soft-deletable surface (`save` / `findById` / `softDelete` / `listChangedSince`)
 * and adds the two center-scoped reads the feature needs: every live override
 * (the Settings list) and the overrides whose inclusive date range intersects a
 * window (the session generator, which materializes over a `[start, end]` and
 * only cares about overrides touching it). Reads exclude tombstones; there is no
 * hard delete.
 */
export interface CenterHoursOverrideRepository
  extends SoftDeletableRepository<CenterHoursOverrideId, CenterHoursOverride> {
  /** Every live override for a center, ordered by range start then id. May be empty. */
  listForCenter(centerCode: CenterCode): Promise<readonly CenterHoursOverride[]>;
  /**
   * Live overrides whose inclusive `[dateRange.start, dateRange.end]` intersects
   * the inclusive civil range `[rangeStart, rangeEnd]`, ordered by range start
   * then id. Both bounds are strict `YYYY-MM-DD`, compared lexicographically.
   */
  listOverlapping(
    centerCode: CenterCode,
    rangeStart: string,
    rangeEnd: string,
  ): Promise<readonly CenterHoursOverride[]>;
}
