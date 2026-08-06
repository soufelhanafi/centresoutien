import type { IpcResponse } from '../../../shared/ipc/contract';

/**
 * The presentation contract for license activation (SOU-104). The DTO shapes are
 * DERIVED from the shared IPC contract — the single source of truth for both ends
 * of the `license.status` / `license.activate` channels — never hand-copied. Only
 * the local {@link LicenseApi} seam interface lives here, so the concrete adapter
 * (the preload passthrough) is swapped in one place — see `license-api.ts`.
 */

/** Current license state — drives the activation gate and the Settings tab. */
export type LicenseStatusView = IpcResponse<'license.status'>;

/** Outcome of a paste/import activation attempt. Branch the UI on the union tag. */
export type LicenseActivateResult = IpcResponse<'license.activate'>;

export interface LicenseApi {
  status(): Promise<LicenseStatusView>;
  activate(license: string): Promise<LicenseActivateResult>;
}
