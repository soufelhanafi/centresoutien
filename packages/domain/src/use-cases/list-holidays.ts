import type { HolidayRepository } from '../ports/holiday-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Holiday } from '../entities/holiday';

/** Which slice of a center's holidays to return: the live list or the archive. */
export type HolidayScope = 'active' | 'archived';

export type ListHolidaysInput = {
  centerCode: CenterCode;
  /** `'active'` (default view) or `'archived'` (the restore list). */
  scope: HolidayScope;
};

/**
 * Lists a center's holidays for the list screen. Gated by `settings.holidays`.
 * `scope` selects the live holidays or the archived (tombstoned) ones so a single
 * use case backs both the main list and the restore view.
 *
 * Ordering is chronological by `startDate`, then by French name as a stable
 * tie-breaker — a locale-agnostic default the use case owns, so it does not depend
 * on adapter row order (the in-memory fake and SQLite agree). Year filtering is a
 * presentation concern (a `fixed` holiday recurs across all years), so it is not
 * done here.
 */
export class ListHolidays {
  constructor(
    private readonly holidays: HolidayRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListHolidaysInput): Promise<readonly Holiday[]> {
    this.plan.require('settings.holidays');
    const holidays =
      input.scope === 'archived'
        ? await this.holidays.listArchived(input.centerCode)
        : await this.holidays.listActive(input.centerCode);
    return [...holidays].sort(
      (a, b) => a.startDate.localeCompare(b.startDate) || a.name.fr.localeCompare(b.name.fr),
    );
  }
}
