import type { LicenseApi } from './license-contract';

/**
 * The real license adapter (SOU-104): both calls pass straight through the typed
 * preload bridge to main's `license.status` / `license.activate` handlers — the
 * only place that verifies signatures, checks the machine/center binding, and
 * flips the live plan. The renderer trusts main's verdict and never decodes an
 * envelope itself.
 */
export const licenseApi: LicenseApi = {
  status: () => window.api.invoke('license.status', {}),
  activate: (license) => window.api.invoke('license.activate', { license }),
};
