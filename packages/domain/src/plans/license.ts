import type { PlanId } from './plans';

/**
 * The verified, structured payload of a license file (SOU-98). The vendor signs
 * these claims with its private Ed25519 key; the app carries only the public key
 * and trusts a claim set only once its signature checks out.
 *
 * `machineId` / `centerCode` are optional binding fields carried for the
 * activation UI (SOU-104) to surface wrong-machine / wrong-center states. SOU-98
 * deliberately does **not** enforce them — its verification scope is signature +
 * expiry only.
 */
export type LicenseClaims = {
  readonly plan: PlanId;
  /** ISO-8601 UTC instant the vendor issued the license. */
  readonly issuedAt: string;
  /** ISO-8601 UTC expiry; `null` for a perpetual license. */
  readonly expiresAt: string | null;
  /** Optional device binding — enforced by the activation flow (SOU-104). */
  readonly machineId: string | null;
  /** Optional center binding — enforced by the activation flow (SOU-104). */
  readonly centerCode: string | null;
  /**
   * How many centers this license may run (multi-center Premium). `null` when the
   * vendor left it unspecified — surfaced by the activation UI as a display detail
   * (SOU-104), never a gate; `org.multi-center` remains the actual entitlement.
   */
  readonly centersAllowed: number | null;
  /**
   * ISO-8601 UTC instant the Founder-Program discount metadata lapses, or `null`
   * when the license carries no founder discount. Purely informational: a lapsed
   * founder discount never changes the resolved plan (SOU-104) — it only drives a
   * "discount expired" banner in the activation screen.
   */
  readonly founderDiscountExpiresAt: string | null;
};

/**
 * The outcome of {@link LicensePort.verify} — the signature check only. Expiry is
 * a Clock-driven domain rule applied later by `resolveActivePlan`, so a valid
 * result here means "the signature is authentic", not "the license is active".
 */
export type LicenseVerification =
  | { readonly status: 'valid'; readonly claims: LicenseClaims }
  | { readonly status: 'missing' }
  | { readonly status: 'invalid-signature' };
