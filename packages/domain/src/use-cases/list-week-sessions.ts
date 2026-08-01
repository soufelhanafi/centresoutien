import type { WeeklySessionViewReadPort } from '../ports/weekly-session-view-read-port';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { WeeklySessionView } from '../read-models/weekly-session-view';

export type ListWeekSessionsInput = {
  centerCode: CenterCode;
};

/**
 * Lists every live weekly recurring session of a center as the enriched
 * {@link WeeklySessionView} the planner grid (SOU-54) renders — subject colour,
 * exam-prep kind, and room/teacher/subject/level for the filters. Gated by
 * `core.calendar.week` (every plan; the guard still has one home).
 *
 * The enrichment (session ⋈ group ⋈ subject, + room, + teacher) and the ordering
 * (weekday then start time) are the read port's contract, so this use case adds no
 * join and no re-sort — the SQLite adapter's LEFT JOINs and `(day_of_week, …)`
 * ordering serve both, and duplicating either here would fork the contract.
 *
 * Filtering by teacher / room / level is deliberately left to the renderer for now
 * — a center's week is ~500 rows at most, so the grid filters client-side and the
 * port keeps a single read (YAGNI). Push filters into the port only if a measured
 * need appears.
 */
export class ListWeekSessions {
  constructor(
    private readonly sessions: WeeklySessionViewReadPort,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListWeekSessionsInput): Promise<readonly WeeklySessionView[]> {
    this.plan.require('core.calendar.week');
    return this.sessions.listWeekView(input.centerCode);
  }
}
