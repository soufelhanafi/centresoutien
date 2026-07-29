import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { CenterHours, CenterHoursId } from '../entities/center-hours';
import type { CenterCode } from '../value-objects/ids';
import type { WeekdayIndex } from '../value-objects/weekday';

/**
 * Persistence port for center opening hours. Inherits the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`) and adds two
 * center-scoped reads the Settings screen needs: the whole live week, and a
 * single weekday (the upsert lookup in `SaveCenterHours`). Reads exclude
 * tombstones; there is no hard delete.
 */
export interface CenterHoursRepository
  extends SoftDeletableRepository<CenterHoursId, CenterHours> {
  /** The live rows for a center, ordered by weekday. May be empty (fresh center). */
  listForCenter(centerCode: CenterCode): Promise<readonly CenterHours[]>;
  /** The live row for one weekday, or null when that day has never been saved. */
  findByDay(centerCode: CenterCode, dayOfWeek: WeekdayIndex): Promise<CenterHours | null>;
}
