import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Holiday, HolidayId } from '../entities/holiday';
import type { CenterCode } from '../value-objects/ids';

/**
 * Persistence port for Holidays. Extends the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`; reads exclude
 * tombstones, no hard delete) with the Holiday-specific reads the list and
 * restore flows need. Holidays are not people-like and carry no plan limit, so
 * there is no `findByNaturalKey` and no `countActive`.
 *
 * The list is unfiltered by year on purpose: year filtering is a presentation
 * concern (a `fixed` holiday recurs every year, so "which years it belongs to" is
 * a rendering question, not a storage one). The SQLite adapter lands in the data
 * layer alongside `0012_holidays.sql`.
 */
export interface HolidayRepository extends SoftDeletableRepository<HolidayId, Holiday> {
  /** Every live (non-tombstoned) holiday of the center, for the list screen. */
  listActive(centerCode: CenterCode): Promise<readonly Holiday[]>;
  /**
   * Every archived (tombstoned) holiday of the center, so the UI can offer
   * restore. The mirror of `listActive` — only rows with `deletedAt` set.
   */
  listArchived(centerCode: CenterCode): Promise<readonly Holiday[]>;
  /**
   * Read a tombstoned holiday by id so `RestoreHoliday` can revive it. Returns
   * null for an unknown or still-live id — the inverse of `findById`, which hides
   * tombstones. Center scoping is enforced by the use case, not here.
   */
  findArchivedById(id: HolidayId): Promise<Holiday | null>;
}
