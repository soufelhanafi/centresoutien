import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { DashboardBasicMetricsBuilder } from '../services/dashboard-basic-metrics-builder';
import { mondayOfWeek } from '../services/dashboard-basic-metrics';
import type { DashboardBasicSummary } from '../read-models/dashboard-basic-summary';

export type GetDashboardBasicSummaryInput = {
  centerCode: CenterCode;
};

/**
 * The Basique dashboard's four cards — Argent, Effectifs, Charge enseignants,
 * Séances (SOU-177), gated by `dashboard.basic` (every plan). A thin
 * orchestrator: derives the reporting month + ISO week from the injected
 * {@link Clock}, runs the four widget builders in parallel, and returns the
 * cross-aggregate read model. All money/date math lives in
 * {@link DashboardBasicMetricsBuilder}; this class only wires time + plan gate.
 */
export class GetDashboardBasicSummary {
  constructor(
    private readonly builder: DashboardBasicMetricsBuilder,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetDashboardBasicSummaryInput): Promise<DashboardBasicSummary> {
    this.plan.require('dashboard.basic');

    const now = this.clock.now();
    const month = now.toISOString().slice(0, 7);
    const weekStart = mondayOfWeek(now);

    const [argent, effectifs, teacherWeeklyLoad, seances] = await Promise.all([
      this.builder.buildArgent(input.centerCode, month),
      this.builder.buildEffectifs(input.centerCode, month),
      this.builder.buildTeacherWeeklyLoad(input.centerCode),
      this.builder.buildSeances(input.centerCode, weekStart),
    ]);

    return { argent, effectifs, teacherWeeklyLoad, seances };
  }
}
