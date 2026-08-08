import type { PlanId } from '../plans/plans';
import type { CenterCode } from '../value-objects/ids';
import type { Clock } from '../ports/clock';
import type { LicensePort, MachineIdentity } from '../ports/license-port';
import { resolveActivePlan, type LicenseStatus } from '../plans/resolve-active-plan';
import { isFounderDiscountExpired } from '../plans/license-activation';

/**
 * The current license state for the activation screen and the Settings panel
 * (SOU-104). Mirrors {@link resolveActivePlan} but flattened for the boundary:
 * `restricted` is the single flag the UI labels "mode restreint" on. `plan` is the
 * tier gating actually runs on — the fallback tier whenever `status !== 'active'`.
 */
export type LicenseStatusView = {
  readonly status: LicenseStatus;
  readonly plan: PlanId;
  readonly restricted: boolean;
  readonly expiresAt: string | null;
  readonly centersAllowed: number | null;
  readonly founderDiscountExpiresAt: string | null;
  readonly founderDiscountExpired: boolean;
};

/**
 * Reads the installed license and reports its resolved state, binding included, so
 * the UI can show the current tier, the centers it allows, and a clearly-labeled
 * restricted mode for a tampered / wrong-machine / expired file (SOU-104
 * acceptance: never crash — fall back to restricted mode). Read-only and
 * ungated; every user can inspect activation state.
 */
export class GetLicenseStatus {
  constructor(
    private readonly license: LicensePort,
    private readonly machine: MachineIdentity,
    private readonly clock: Clock,
    private readonly centerCode: CenterCode,
    private readonly demoAnchorTrusted: boolean,
  ) {}

  execute(): LicenseStatusView {
    const now = this.clock.now();
    const resolution = resolveActivePlan(this.license.verify(), now, {
      machineId: this.machine.machineId(),
      centerCode: this.centerCode,
      demoAnchorTrusted: this.demoAnchorTrusted,
    });
    const { claims } = resolution;

    return {
      status: resolution.status,
      plan: resolution.plan.id,
      restricted: resolution.status !== 'active',
      expiresAt: claims?.expiresAt ?? null,
      centersAllowed: claims?.centersAllowed ?? null,
      founderDiscountExpiresAt: claims?.founderDiscountExpiresAt ?? null,
      founderDiscountExpired: claims !== null && isFounderDiscountExpired(claims, now),
    };
  }
}
