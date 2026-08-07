import { PLANS, type LicensePort, type LicenseVerification, type PlanId } from '@centresoutien/domain';

/**
 * E2E-ONLY trust-anchor bypass (SOU-172). A {@link LicensePort} that reports a
 * perpetual, unbound, signature-valid license of a chosen tier — so the packaged
 * E2E build boots ACTIVE (not restricted) with the plan the spec asked for via
 * `CS_PLAN`, exactly as the whole suite ran before the SOU-104 hard lock existed.
 *
 * The lock itself is proven by `license-activation.spec.ts` (S1–S13), which uses
 * the real {@link Ed25519LicenseAdapter} over committed-key-signed files; every
 * OTHER spec tests a feature and needs an unlocked app, which this provides
 * without a private key. It is constructed ONLY inside the `__CS_E2E__` branch of
 * the composition root, so a release build (`__CS_E2E__ === false`) dead-code-
 * eliminates both the branch and this module — the honest-user security baseline
 * (CLAUDE.md §5quater) is untouched in production.
 */
export class E2eSyntheticLicense implements LicensePort {
  private readonly verification: LicenseVerification;

  constructor(plan: PlanId) {
    this.verification = {
      status: 'valid',
      claims: {
        plan,
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: null,
        machineId: null,
        centerCode: null,
        centersAllowed: null,
        founderDiscountExpiresAt: null,
      },
    };
  }

  verify(): LicenseVerification {
    return this.verification;
  }

  verifyContent(): LicenseVerification {
    return this.verification;
  }
}

export function isPlanId(value: string | undefined): value is PlanId {
  return value !== undefined && Object.prototype.hasOwnProperty.call(PLANS, value);
}
