import { PLANS, type Plan } from './plans';
import type { LicenseClaims, LicenseVerification } from './license';
import type { LicenseBindingContext } from './license-activation';
import {
  type LicenseError,
  LicenseExpiredError,
  LicenseMissingError,
  LicenseSignatureInvalidError,
  LicenseWrongCenterError,
  LicenseWrongMachineError,
} from '../errors/license-errors';

/** The effective license state once signature, binding, *and* expiry are considered. */
export type LicenseStatus =
  | 'active'
  | 'trial-active'
  | 'trial-expired'
  | 'missing'
  | 'invalid-signature'
  | 'expired'
  | 'wrong-machine'
  | 'wrong-center';

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

/**
 * The hard-lock decision (SOU-104): only an active license or active trial keeps
 * the app out of restricted mode, where the IPC boundary otherwise answers only the license
 * status/activation channels. This is the single authority the main-process guard
 * consults; the renderer's `LicenseGate` is cosmetic on top of the same rule.
 */
export function isRestrictedMode(status: LicenseStatus): boolean {
  return status !== 'active' && status !== 'trial-active';
}

/**
 * A license is expired when it carries an expiry at or before "now". A non-null
 * but unparsable `expiresAt` fails closed (treated as expired) — a garbage expiry
 * must never read as "still valid" and grant a tier.
 */
export function isLicenseExpired(claims: LicenseClaims, now: Date): boolean {
  if (claims.expiresAt === null) return false;
  const expiresAt = Date.parse(claims.expiresAt);
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt <= now.getTime();
}

/**
 * The single authority for the active plan (CLAUDE.md §4). Folds the adapter's
 * signature check together with the machine/center binding and the Clock-driven
 * expiry check, and maps the result to a concrete {@link Plan}. `now` comes from
 * the injected `Clock`, never a bare `new Date()` in a caller. This is what
 * `PlanPolicy` is built from — the user-editable `center.plan` row is never
 * consulted.
 *
 * `binding` is optional for backward compatibility: when omitted, only signature +
 * expiry are considered (SOU-98). When supplied (startup, SOU-104), a signature-
 * valid license bound to a different machine or center resolves to the fallback
 * tier — a license copied off its machine can no longer self-upgrade.
 */
export function resolveActivePlan(
  verification: LicenseVerification,
  now: Date,
  binding?: LicenseBindingContext,
): LicenseResolution {
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

  if (binding && claims.machineId !== null && claims.machineId !== binding.machineId) {
    return {
      status: 'wrong-machine',
      plan: PLANS.essentiel,
      claims,
      error: new LicenseWrongMachineError(claims.machineId, binding.machineId),
    };
  }
  if (binding && claims.centerCode !== null && claims.centerCode !== binding.centerCode) {
    return {
      status: 'wrong-center',
      plan: PLANS.essentiel,
      claims,
      error: new LicenseWrongCenterError(claims.centerCode, binding.centerCode),
    };
  }

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
