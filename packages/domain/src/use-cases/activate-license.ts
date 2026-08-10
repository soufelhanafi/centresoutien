import type { CenterCode } from '../value-objects/ids';
import type { Clock } from '../ports/clock';
import type { LicensePort, LicenseStorePort, MachineIdentity } from '../ports/license-port';
import type { PlanPolicy } from '../plans/plan-policy';
import { PLANS, type Plan, type PlanId } from '../plans/plans';
import {
  evaluateLicenseBinding,
  isFounderDiscountExpired,
  type LicenseActivationResult,
} from '../plans/license-activation';

export type ActivateLicenseInput = {
  /** The raw license envelope: the text the user pasted or the imported file's bytes. */
  readonly rawLicense: string;
};

export type ResolveLicensePlan = (planId: PlanId) => Plan;

/**
 * Activates a license supplied through the activation screen (SOU-104): verify the
 * signature, check it binds to this machine + center and has not expired, and only
 * then persist it and flip the active plan. A rejected license writes nothing and
 * leaves the running plan untouched — the app never self-downgrades because a user
 * pasted the wrong file.
 *
 * Not plan-gated: activation is how a center *acquires* a plan, so it is available
 * on every tier. The plan flip happens in-process via {@link PlanPolicy} so gates
 * take effect immediately; the persisted file makes it survive the next restart.
 */
export class ActivateLicense {
  constructor(
    private readonly license: LicensePort,
    private readonly store: LicenseStorePort,
    private readonly machine: MachineIdentity,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
    private readonly centerCode: CenterCode,
    private readonly demoAnchorTrusted: boolean,
    private readonly resolvePlan: ResolveLicensePlan = (planId) => PLANS[planId],
  ) {}

  execute(input: ActivateLicenseInput): LicenseActivationResult {
    if (input.rawLicense.trim() === '') {
      return { status: 'rejected', reason: 'malformed' };
    }

    const verification = this.license.verifyContent(input.rawLicense);
    if (verification.status !== 'valid') {
      return { status: 'rejected', reason: 'invalid-signature' };
    }

    const { claims } = verification;
    const now = this.clock.now();
    const rejection = evaluateLicenseBinding(
      claims,
      {
        machineId: this.machine.machineId(),
        centerCode: this.centerCode,
        demoAnchorTrusted: this.demoAnchorTrusted,
      },
      now,
    );
    if (rejection !== null) {
      return { status: 'rejected', reason: rejection };
    }

    this.store.save(input.rawLicense);
    this.plan.setActivePlan(this.resolvePlan(claims.plan));

    return {
      status: 'activated',
      plan: claims.plan,
      expiresAt: claims.expiresAt,
      centersAllowed: claims.centersAllowed,
      founderDiscount: {
        expiresAt: claims.founderDiscountExpiresAt,
        expired: isFounderDiscountExpired(claims, now),
      },
    };
  }
}
