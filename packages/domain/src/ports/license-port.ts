import type { LicenseVerification } from '../plans/license';

/**
 * Reads the local license file and verifies its Ed25519 signature against the
 * embedded vendor public key. The adapter (data layer) owns the crypto; the
 * domain owns what a verified license *means* (see `resolveActivePlan`).
 *
 * Synchronous on purpose: this is a single local read done once at startup,
 * mirroring the `Clock` / `IdGenerator` ports rather than the async repositories.
 * The future cloud tier resolves the plan from the subscription record
 * server-side and does not implement this port.
 *
 * Contract:
 * - Never throws. A missing or forged license is an expected offline state,
 *   returned as `{ status: 'missing' }` / `{ status: 'invalid-signature' }`.
 * - Does **not** check expiry — expiry is a Clock-driven rule owned by
 *   `resolveActivePlan`, since laptop wall-clock reads belong to the injected
 *   `Clock`, never the adapter.
 */
export interface LicensePort {
  verify(): LicenseVerification;
}
