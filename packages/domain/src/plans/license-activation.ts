import type { PlanId } from './plans';
import type { LicenseClaims } from './license';
import { isLicenseExpired } from './resolve-active-plan';

/**
 * The device + tenant a license is checked against during activation and startup
 * resolution. `machineId` comes from the {@link MachineIdentity} port; `centerCode`
 * is the open center. Both are the app's own facts, never renderer input.
 */
export type LicenseBindingContext = {
  readonly machineId: string;
  readonly centerCode: string;
};

/**
 * Why a signature-valid license still cannot be activated on this device. `malformed`
 * and `invalid-signature` are pre-binding failures (bad bytes / bad signature); the
 * rest are binding failures on an otherwise-authentic license. Each maps to a
 * distinct state in the activation screen (SOU-104).
 */
export type LicenseRejectionReason =
  | 'malformed'
  | 'invalid-signature'
  | 'wrong-machine'
  | 'wrong-center'
  | 'expired';

/**
 * The binding check applied to an already-signature-verified claim set: is this
 * authentic license actually meant for *this* machine, *this* center, and still
 * within its validity window? Returns the first failing reason, or `null` when the
 * license binds cleanly. Machine/center identity is checked before expiry — a
 * license that isn't yours at all is a more fundamental mismatch than one that has
 * lapsed. A `null` binding field means "unbound" and always matches.
 */
export function evaluateLicenseBinding(
  claims: LicenseClaims,
  context: LicenseBindingContext,
  now: Date,
): Exclude<LicenseRejectionReason, 'malformed' | 'invalid-signature'> | null {
  if (claims.machineId !== null && claims.machineId !== context.machineId) {
    return 'wrong-machine';
  }
  if (claims.centerCode !== null && claims.centerCode !== context.centerCode) return 'wrong-center';
  if (isLicenseExpired(claims, now)) return 'expired';
  return null;
}

/**
 * Whether the license's Founder-Program discount metadata has lapsed at "now". A
 * lapsed founder discount is informational only — it never rejects activation nor
 * downgrades the plan (SOU-104); it drives a banner. A non-null but unparsable
 * value fails closed (treated as expired), mirroring {@link isLicenseExpired}.
 */
export function isFounderDiscountExpired(claims: LicenseClaims, now: Date): boolean {
  if (claims.founderDiscountExpiresAt === null) return false;
  const lapsesAt = Date.parse(claims.founderDiscountExpiresAt);
  if (Number.isNaN(lapsesAt)) return true;
  return lapsesAt <= now.getTime();
}

/** The founder-discount metadata surfaced to the activation UI on a valid license. */
export type FounderDiscountView = {
  readonly expiresAt: string | null;
  readonly expired: boolean;
};

/**
 * The outcome of {@link ActivateLicense}. On success the license is persisted and
 * the active plan flipped; on rejection nothing is written and the plan is left
 * untouched. `reason` is the single field the activation screen branches its states
 * on. `centersAllowed` / `founderDiscount` are display metadata for the valid state.
 */
export type LicenseActivationResult =
  | {
      readonly status: 'activated';
      readonly plan: PlanId;
      readonly expiresAt: string | null;
      readonly centersAllowed: number | null;
      readonly founderDiscount: FounderDiscountView;
    }
  | {
      readonly status: 'rejected';
      readonly reason: LicenseRejectionReason;
    };
