import { z } from 'zod';

/**
 * IPC surface for LAN hub hosting + discovery (SOU-318). `hostingStatus` /
 * `enableHosting` / `disableHosting` designate the open center's device as its
 * hub (host side); `discoverCenters` browses the LAN for hubs to join (client
 * side). All four are gated on `sync.multi-device` in the handler — the domain
 * plan check, not just the renderer's `useFeature` hiding. The pairing token is
 * returned to the host's own UI to display but is never advertised over mDNS.
 */

export const hubHostingStatusSchema = z.discriminatedUnion('hosting', [
  z.object({ hosting: z.literal(false) }),
  z.object({
    hosting: z.literal(true),
    /** The LAN IPv4 the hub serves on — shown so a joiner can confirm the host. */
    address: z.string(),
    port: z.number().int().min(1).max(65535),
    /** The per-center pairing token the director reads out to the joining laptop. */
    token: z.string(),
  }),
]);

export const discoveredHubSchema = z.object({
  name: z.string(),
  host: z.string(),
  port: z.number().int().min(1).max(65535),
  centreId: z.string(),
  centerCode: z.string(),
});

export const hubIpcContract = {
  'hub.hostingStatus': {
    request: z.object({}),
    response: hubHostingStatusSchema,
  },
  'hub.enableHosting': {
    request: z.object({}),
    response: hubHostingStatusSchema,
  },
  'hub.disableHosting': {
    request: z.object({}),
    response: z.object({ ok: z.literal(true) }),
  },
  'hub.discoverCenters': {
    request: z.object({}),
    response: z.object({ centers: z.array(discoveredHubSchema) }),
  },
  'hub.joinCenter': {
    request: z.object({
      baseUrl: z.string().min(1),
      token: z.string().min(1),
      centerCode: z.string().min(1),
    }),
    response: z.object({
      ok: z.literal(true),
      centreId: z.string(),
      centerCode: z.string(),
    }),
  },
} as const;
