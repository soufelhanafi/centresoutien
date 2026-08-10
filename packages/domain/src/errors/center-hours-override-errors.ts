import { DomainError } from './plan-errors';
import type { CenterHoursOverrideId } from '../entities/center-hours-override';

/**
 * Thrown when a save-update or archive targets a center-hours override id with no
 * live row in the current center — unknown, already tombstoned, or belonging to
 * another center (the use case checks the loaded row's `centerCode` against the
 * request so one center can never touch another's override). The renderer
 * resolves the stable `center-hours-override-not-found` code via
 * `t(\`errors.${code}\`)`; the domain stays i18n-agnostic. Mirrors
 * {@link HolidayNotFoundError}.
 */
export class CenterHoursOverrideNotFoundError extends DomainError {
  readonly code = 'center-hours-override-not-found';

  constructor(readonly overrideId: CenterHoursOverrideId) {
    super(`No live center-hours override "${overrideId}" in this center.`);
  }
}
