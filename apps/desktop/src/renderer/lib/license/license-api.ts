import type { LicenseApi, LicenseActivateResult, LicenseStatusView } from './license-contract';

/**
 * Contract-first seam for SOU-104. The real backend (branch
 * `feature/SOU-104-domain`) exposes two IPC channels — `license.status` and
 * `license.activate` — that this app consumes. Until that branch merges into the
 * integration branch, the UI runs against the in-memory mock below, behind the
 * SAME {@link LicenseApi} interface, so wiring the real adapter is a one-line
 * binding change with zero UI edits:
 *
 *   // after integration, replace the mock binding with:
 *   export const licenseApi: LicenseApi = {
 *     status: () => window.api.invoke('license.status', {}),
 *     activate: (license) => window.api.invoke('license.activate', { license }),
 *   };
 *
 * The mock decodes a few sentinels in the pasted text so QA can exercise every
 * result state without a real signed envelope.
 */

function reasonFromSentinel(raw: string): LicenseActivateResult {
  const text = raw.trim();
  if (text.length === 0) return { status: 'rejected', reason: 'malformed' };
  if (text.includes('WRONG-MACHINE')) return { status: 'rejected', reason: 'wrong-machine' };
  if (text.includes('WRONG-CENTER')) return { status: 'rejected', reason: 'wrong-center' };
  if (text.includes('EXPIRED')) return { status: 'rejected', reason: 'expired' };
  if (text.includes('TAMPER')) return { status: 'rejected', reason: 'invalid-signature' };
  const plan = text.includes('PREMIUM') ? 'premium' : text.includes('ESSENTIEL') ? 'essentiel' : 'pro';
  return {
    status: 'activated',
    plan,
    expiresAt: '2027-08-01T00:00:00.000Z',
    centersAllowed: plan === 'premium' ? null : 1,
    founderDiscount: { expiresAt: '2026-12-31T00:00:00.000Z', expired: false },
  };
}

function createMockLicenseApi(): LicenseApi {
  let current: LicenseStatusView = {
    status: 'missing',
    plan: 'essentiel',
    restricted: true,
    expiresAt: null,
    centersAllowed: null,
    founderDiscountExpiresAt: null,
    founderDiscountExpired: false,
  };

  return {
    status: () => Promise.resolve(current),
    activate: (license) => {
      const result = reasonFromSentinel(license);
      if (result.status === 'activated') {
        current = {
          status: 'active',
          plan: result.plan,
          restricted: false,
          expiresAt: result.expiresAt,
          centersAllowed: result.centersAllowed,
          founderDiscountExpiresAt: result.founderDiscount.expiresAt,
          founderDiscountExpired: result.founderDiscount.expired,
        };
      }
      return Promise.resolve(result);
    },
  };
}

export const licenseApi: LicenseApi = createMockLicenseApi();
