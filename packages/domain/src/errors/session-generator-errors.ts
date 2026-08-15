import { DomainError } from './plan-errors';
import type { WeekdayIndex } from '../value-objects/weekday';

/** Why the auto-generator cannot satisfy the requested weekly pattern. */
export type InfeasibleGeneratorReason =
  | 'non-positive-sessions-per-week' // asked for zero (or fewer) sessions a week
  | 'pool-smaller-than-sessions' // fewer eligible weekdays than sessions requested
  | 'gap-unsatisfiable' // no placement of the sessions keeps every pair ≥ minGapDays apart
  | 'room-capacity-exceeded' // groups × sessionsPerWeek outgrows eligibleDays × rooms (SOU-261)
  | 'duration-exceeds-windows'; // no opening window on any eligible day fits sessionDurationMinutes (SOU-261)

/**
 * Thrown by the auto mode of the session generator (SOU-158) when no set of
 * `sessionsPerWeek` weekdays drawn from the eligible pool can honor the
 * `minGapDays` minimum-gap constraint — e.g. 3 sessions a week with a 3-day gap
 * (needs 9 days of spread in a 7-day week), or a pool left with too few open
 * days after closed weekdays are excluded. The eligible pool passed here is the
 * *effective* one (`weekdayPool` minus days the center is closed), so the
 * renderer can show exactly which days were actually available. Carries the
 * stable `infeasible-generator-config` code for `t(\`errors.${code}\`)`; the
 * domain stays i18n-agnostic. Custom mode never throws this — its gap breaches
 * are flagged, not blocked.
 */
export class InfeasibleGeneratorConfigError extends DomainError {
  readonly code = 'infeasible-generator-config';

  constructor(
    readonly reason: InfeasibleGeneratorReason,
    readonly eligibleWeekdays: readonly WeekdayIndex[],
    readonly sessionsPerWeek: number,
    readonly minGapDays: number,
  ) {
    super(
      `Cannot place ${sessionsPerWeek} session(s)/week with a ${minGapDays}-day gap ` +
        `across weekdays [${eligibleWeekdays.join(', ')}] (${reason}).`,
    );
  }
}

/**
 * Thrown by the session generator (SOU-158) when it needs to assign a room to
 * at least one generated block but was given an empty room pool. Every
 * `WeeklyRecurringSession` requires a `roomId`, so a center with zero rooms
 * configured cannot receive a generated plan until at least one room exists.
 * Carries the stable `no-rooms-configured` code for `t(\`errors.${code}\`)`.
 */
export class NoRoomsConfiguredError extends DomainError {
  readonly code = 'no-rooms-configured';

  constructor() {
    super('Cannot assign rooms to the generated plan: no rooms are configured for this center.');
  }
}
