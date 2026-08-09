import type { DesktopApi } from '../../../shared/ipc/api';

/** The pricing page the upgrade CTA links to (SOU-85). Whitelisted in main. */
export const TARIFS_URL = 'https://centresoutien.com/tarifs';

/**
 * Contract-first stand-in for the preload `external.open(url)` bridge (SOU-85
 * domain lane). The renderer never opens a browser itself — it asks main, which
 * whitelists the host to `centresoutien.com`.
 *
 * SWAP SEAM: `external` isn't on `DesktopApi` until the preload change merges,
 * so we read it through a widening view of the bridge (no `unknown`, no `any`).
 * When the domain adapter lands, drop `ExternalBridge` and the intersection —
 * `window.api.external.open` types directly and this file is a one-liner.
 */
type ExternalBridge = { open(url: string): Promise<void> };
type ApiWithExternal = DesktopApi & { external?: ExternalBridge };

export async function openTarifs(): Promise<void> {
  const api: ApiWithExternal = window.api;
  await api.external?.open(TARIFS_URL);
}
