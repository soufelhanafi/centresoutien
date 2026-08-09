import { z } from 'zod';

/**
 * Open a URL in the user's default browser (SOU-85). The one consumer today is
 * the upgrade CTA's "voir les tarifs" link to the landing page; the channel is
 * generic so any future external link reuses it instead of an unguarded anchor.
 *
 * Security: main hard-whitelists the destination host (centresoutien.com over
 * https) — see `external-allowlist.ts`. The renderer is untrusted, so a URL that
 * fails the allowlist is refused with `{ opened: false }`, never opened. Spread
 * into `ipcContract` like `dialogIpcContract`; reached through the generic
 * `window.api.invoke('external.open', { url })` bridge (no per-channel preload
 * method, same as the dialog channels).
 */
export const externalIpcContract = {
  'external.open': {
    request: z.object({ url: z.string().url() }),
    response: z.object({ opened: z.boolean() }),
  },
} as const;
