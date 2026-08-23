import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { MultiCenterStatsReadPort } from '../ports/multi-center-stats-read-port';
import type { MultiCenterStatsView } from '../read-models/multi-center-stats-view';
import { buildMultiCenterStatsView } from '../services/multi-center-stats';

/**
 * The per-center stats table for the operator's whole install (SOU-106). A thin
 * orchestrator: it enforces the Premium gate, derives the reporting month from the
 * injected {@link Clock}, delegates the cross-DB read to the port, and shapes the
 * view. No I/O, no rate math live here — those are the adapter's and the pure
 * {@link buildMultiCenterStatsView} service's jobs respectively.
 *
 * Cross-center consolidation is a Premium capability (CLAUDE.md §5ter), so the
 * `org.multi-center` gate is enforced **first**, server-side, before any center DB
 * is touched: on a plan without the feature this throws `PlanFeatureUnavailableError`
 * and the read port is never called. UI hiding is cosmetic; this is the honest-user
 * enforcement, identical to {@link SwitchCenter}'s.
 */
export class GetMultiCenterStats {
  constructor(
    private readonly plan: PlanPolicy,
    private readonly port: MultiCenterStatsReadPort,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<MultiCenterStatsView> {
    this.plan.require('org.multi-center');
    const month = this.clock.now().toISOString().slice(0, 7);
    const rawRows = await this.port.readMonthly(month);
    return buildMultiCenterStatsView(month, rawRows);
  }
}
