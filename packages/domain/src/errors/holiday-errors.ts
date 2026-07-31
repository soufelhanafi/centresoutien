import { DomainError } from './plan-errors';
import type { HolidayId } from '../entities/holiday';

/**
 * Thrown when an update/archive/restore targets a holiday id that has no matching
 * row in the current center — unknown, wrong tombstone state for the operation, or
 * belonging to another center. The renderer resolves the stable `holiday-not-found`
 * code via `t(\`errors.${code}\`)`; the domain stays i18n-agnostic. Mirrors
 * `RoomNotFoundError` so the archive/restore use cases behave consistently and
 * never silently no-op.
 */
export class HolidayNotFoundError extends DomainError {
  readonly code = 'holiday-not-found';

  constructor(readonly holidayId: HolidayId) {
    super(`No matching holiday with id "${holidayId}".`);
  }
}
