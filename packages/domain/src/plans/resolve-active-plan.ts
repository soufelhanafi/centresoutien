import { PLANS, type Plan } from './plans';
import type { LicenseClaims, LicenseVerification } from './license';
import {
  type LicenseError,
  LicenseExpiredError,
  LicenseMissingError,
  LicenseSignatureInvalidError,
} from '../errors/license-errors';

/** The effective license state once signature *and* expiry are considered. */
export type LicenseStatus = 'active' | 'missing' | 'invalid-signature' | 'expired';

/**
 * The resolved plan plus why. `plan` is always safe to gate on: an active,
 * signature-valid, unexpired license yields its tier; every other state falls
 * back to `essentiel`. `error` names the failure for the activation UI (SOU-104);
 * SOU-98 only reads `plan` (and `status` for the display mirror).
 */
export type LicenseResolution = {
  readonly status: LicenseStatus;
  readonly plan: Plan;
  readonly claims: LicenseClaims | null;
  readonly error: LicenseError | null;
};

/** A license is expired when it carries an expiry at or before "now". */
export function isLicenseExpired(claims: LicenseClaims, now: Date): boolean {
  if (claims.expiresAt === null) return false;
  return new Date(claims.expiresAt).getTime() <= now.getTime();
}

/**
 * The single authority for the active plan (CLAUDE.md §4). Folds the adapter's
 * signature check together with the Clock-driven expiry check and maps the result
 * to a concrete {@link Plan}. `now` comes from the injected `Clock`, never a bare
 * `new Date()` in a caller. This is what `PlanPolicy` is built from — the
 * user-editable `center.plan` row is never consulted.
 */
export function resolveActivePlan(verification: LicenseVerification, now: Date): LicenseResolution {
  if (verification.status === 'missing') {
    return { status: 'missing', plan: PLANS.essentiel, claims: null, error: new LicenseMissingError() };
  }
  if (verification.status === 'invalid-signature') {
    return {
      status: 'invalid-signature',
      plan: PLANS.essentiel,
      claims: null,
      error: new LicenseSignatureInvalidError(),
    };
  }

  const { claims } = verification;
  if (isLicenseExpired(claims, now)) {
    return {
      status: 'expired',
      plan: PLANS.essentiel,
      claims,
      error: new LicenseExpiredError(claims.expiresAt ?? ''),
    };
  }

  return { status: 'active', plan: PLANS[claims.plan], claims, error: null };
}
