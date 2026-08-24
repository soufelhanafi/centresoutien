import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterProvisioningPort } from '../ports/center-provisioning-port';
import type { CenterSwitchPort } from '../ports/center-switch-port';
import { centerProfileSchema, type CenterProfileInput } from '../schemas/center';

export type CreateCenterInput = { profile: CenterProfileInput };
export type CreateCenterResult = { ok: true; centreId: string; centerCode: string };

/**
 * Creates an additional center from inside the running app and switches into it
 * (SOU-310) — the path that makes Premium's multi-center entitlement usable, since
 * the first-run wizard only ever creates the first center and the switcher can
 * only move between centers that already exist.
 *
 * Adding a center is a cross-center capability, so it is gated on the Premium
 * `org.multi-center` feature (CLAUDE.md §5ter). The gate is enforced here,
 * server-side, BEFORE any DB file is created: on a plan without the feature this
 * throws `PlanFeatureUnavailableError` and never reaches the provisioner. UI
 * hiding of the entry point is cosmetic; this is the honest-user enforcement.
 *
 * Provisioning creates a fully isolated new center DB; the switch then hands off to
 * SOU-96's live hot-swap so the app lands in the new center. The director who owns
 * the new center is resolved by the provisioning adapter from the active session,
 * never from this input, so the renderer cannot forge ownership.
 */
export class CreateCenter {
  constructor(
    private readonly plan: PlanPolicy,
    private readonly provisioner: CenterProvisioningPort,
    private readonly switcher: CenterSwitchPort,
  ) {}

  async execute(input: CreateCenterInput): Promise<CreateCenterResult> {
    this.plan.require('org.multi-center');
    const profile = centerProfileSchema.parse(input.profile);
    const { centreId, centerCode } = await this.provisioner.provision({ profile });
    await this.switcher.switchTo(centreId);
    return { ok: true, centreId, centerCode };
  }
}
