import { DomainError } from './plan-errors';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { WeekdayIndex } from '../value-objects/weekday';

/** Why a session falls outside the center's opening hours. */
export type OutsideCenterHoursReason = 'closed' | 'before-open' | 'after-close';

/**
 * Thrown when a session would start before the center opens, end after it
 * closes, or fall on a closed day (CLAUDE.md §6, `SessionConflictPolicy`). The
 * `reason` and the day's `open`/`close` are carried so the renderer can build a
 * localized message via `t(\`errors.${...}\`)` without the domain formatting
 * strings. Scheduling wires this at the calendar seam in SOU-55.
 */
export class SessionOutsideCenterHoursError extends DomainError {
  constructor(
    readonly dayOfWeek: WeekdayIndex,
    readonly reason: OutsideCenterHoursReason,
    readonly open: TimeOfDay | null,
    readonly close: TimeOfDay | null,
  ) {
    super(`Session on weekday ${dayOfWeek} is outside center hours (${reason}).`);
  }
}
