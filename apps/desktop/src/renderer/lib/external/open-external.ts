/** The pricing page the upgrade CTA links to (SOU-85). Whitelisted in main. */
export const TARIFS_URL = 'https://centresoutien.com/tarifs';

/**
 * Ask main to open the pricing page in the OS browser (SOU-85). The renderer
 * never opens a browser itself — it hands the URL to the generic `external.open`
 * IPC channel, which hard-whitelists the host to `centresoutien.com` before
 * touching the shell (see `main/ipc/external-allowlist.ts`).
 */
export async function openTarifs(): Promise<void> {
  await window.api.invoke('external.open', { url: TARIFS_URL });
}
