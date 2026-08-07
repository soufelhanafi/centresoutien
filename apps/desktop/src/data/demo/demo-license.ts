import type { CenterCode } from '@centresoutien/domain';

/**
 * SOU-110 — the demo center's throwaway license and its DEMO-ONLY trust anchor.
 *
 * The demo center (`centreId: 'demo'`, center code `CS-DEMO-001`) is a sales
 * tool, not a real tenant. Its DB holds fake Moroccan data, so its license is
 * deliberately pre-signed and bundled here — the seeder writes these exact bytes
 * as the demo center's license file so the SOU-104 hard lock stays honest: the
 * demo opens active/premium on ANY machine because its license is `demo: true`
 * (machine binding skipped in verification, see `resolveActivePlan`) and binds
 * to `CS-DEMO-001` (so it can never leak onto a real center).
 *
 * SECURITY MODEL — read this before touching anything:
 *
 *  - The DEMO public key below is committed and trusted by the composition root
 *    ONLY when `centreId === 'demo'`. A release build opens a real center with
 *    the production `VENDOR_LICENSE_PUBLIC_KEY_PEM` — never this key — so a
 *    forged demo license can never activate a real center's data. This is a
 *    deliberate, centreId-scoped trust anchor, NOT a weakening of real-center
 *    verification.
 *  - The matching private key is NOT committed (like the production key). The
 *    envelope below was signed once, offline, with the demo-only keypair and
 *    frozen here. To re-sign (e.g. after changing the claims), regenerate with
 *    the demo-only private key held by the vendor and replace `DEMO_LICENSE_FILE`.
 *  - The `demo: true` claim only skips the machine-binding check. Signature,
 *    expiry, and center binding are still enforced by `resolveActivePlan`.
 */

/** The demo center's tenant code — a fixed, documented fake. */
export const DEMO_CENTER_CODE = 'CS-DEMO-001' as CenterCode;

/**
 * The demo-only Ed25519 public key (SPKI PEM). Trusted for `centreId: 'demo'`
 * only — see the composition root's license-adapter construction.
 */
export const DEMO_LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEANkuJiEMoDT6Sg0AbIdpeXFR50tpGXFB+BoGgnoHH7GM=
-----END PUBLIC KEY-----
`;

/**
 * The demo license's claim set — the exact signed bytes, documented for tests
 * and regeneration. `demo: true` skips the machine binding; `centerCode:
 * 'CS-DEMO-001'` pins it to the demo center; `expiresAt: null` is perpetual.
 */
export const DEMO_LICENSE_CLAIMS = {
  plan: 'premium',
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  machineId: null,
  centerCode: DEMO_CENTER_CODE,
  centersAllowed: null,
  founderDiscountExpiresAt: null,
  demo: true,
} as const;

/**
 * The demo center's license file bytes — the envelope the seeder writes to
 * `license.CS-DEMO-001.json`. Pre-signed with the demo-only private key;
 * matches `licenseFileSchema` (`{ claims: base64, signature: base64 }`).
 */
export const DEMO_LICENSE_FILE = JSON.stringify({
  claims:
    'eyJwbGFuIjoicHJlbWl1bSIsImlzc3VlZEF0IjoiMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaIiwiZXhwaXJlc0F0IjpudWxsLCJtYWNoaW5lSWQiOm51bGwsImNlbnRlckNvZGUiOiJDUy1ERU1PLTAwMSIsImNlbnRlcnNBbGxvd2VkIjpudWxsLCJmb3VuZGVyRGlzY291bnRFeHBpcmVzQXQiOm51bGwsImRlbW8iOnRydWV9',
  signature:
    'kmQcNls0qFLj7RqMHPXMX9C1oQMDEwVymqlNzxRUD930hUxTbbdVri1azaWXS5pIeJ/MCT8Mb/hRl+PNAmyNAw==',
});
