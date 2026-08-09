import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterSwitchPort } from '../ports/center-switch-port';

export type SwitchCenterInput = { centreId: string };
export type SwitchCenterResult = { ok: true; centreId: string };

/**
 * Switches the desktop app to another of the operator's centers (SOU-96). The
 * live in-process hot-swap is performed by the injected {@link CenterSwitchPort}
 * (an Electron-main adapter); this use case owns only the rule that matters for
 * security.
 *
 * Switching between centers is a cross-center capability, so it is gated on the
 * Premium `org.multi-center` feature (CLAUDE.md §5ter — cross-center management
 * belongs to the cloud/Premium tier). The gate is enforced here, server-side,
 * before any database is touched: on a plan without the feature this throws
 * `PlanFeatureUnavailableError` and never reaches the adapter. UI hiding of the
 * switcher is cosmetic; this is the honest-user enforcement.
 */
export class SwitchCenter {
  constructor(
    private readonly plan: PlanPolicy,
    private readonly switcher: CenterSwitchPort,
  ) {}

  async execute(input: SwitchCenterInput): Promise<SwitchCenterResult> {
    this.plan.require('org.multi-center');
    await this.switcher.switchTo(input.centreId);
    return { ok: true, centreId: input.centreId };
  }
}
