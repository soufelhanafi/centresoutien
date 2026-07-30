import type { WeeklyRecurringSessionRepository } from '../ports/weekly-recurring-session-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { WeeklyRecurringSession } from '../entities/weekly-recurring-session';

export type ListWeekSessionsInput = {
  centerCode: CenterCode;
};

/**
 * Lists every live weekly recurring session of a center — the full week the
 * planner grid (SOU-54) renders. Gated by `core.calendar.week` (every plan; the
 * guard still has one home). Ordering (weekday then start time) is part of the
 * repository port's contract, so the use case adds no re-sort: the in-memory fake
 * and the SQLite adapter both honor it, and re-sorting here would duplicate the
 * comparator the `(day_of_week, …)` index already serves.
 *
 * Filtering by teacher / room / level is deliberately left to the renderer for
 * now — a center's week is ~500 rows at most, so the grid filters client-side and
 * the port keeps a single read (YAGNI). Push filters into the port only if a
 * measured need appears.
 */
export class ListWeekSessions {
  constructor(
    private readonly sessions: WeeklyRecurringSessionRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListWeekSessionsInput): Promise<readonly WeeklyRecurringSession[]> {
    this.plan.require('core.calendar.week');
    return this.sessions.listForWeek(input.centerCode);
  }
}
