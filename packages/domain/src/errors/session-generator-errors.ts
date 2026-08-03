import { DomainError } from './plan-errors';
import type { WeekdayIndex } from '../value-objects/weekday';

/** Why the auto-generator cannot satisfy the requested weekly pattern. */
export type InfeasibleGeneratorReason =
  | 'non-positive-sessions-per-week' // asked for zero (or fewer) sessions a week
  | 'pool-smaller-than-sessions' // fewer eligible weekdays than sessions requested
  | 'gap-unsatisfiable'; // no placement of the sessions keeps every pair ≥ minGapDays apart

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
