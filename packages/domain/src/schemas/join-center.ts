import { z } from 'zod';

/**
 * Validates the input to {@link JoinCenter} (SOU-318). The hub URL must be an
 * http(s) origin (the LAN hub speaks HTTP; anything else is a misconfigured or
 * hostile target), the pairing token must be present (it is the hub's per-center
 * auth), and the center code identifies which tenant's feed to pull. Parsed in the
 * use case so a forged/garbled renderer payload is rejected before the hub is
 * contacted.
 */
// The domain package compiles without DOM/Node libs (no `URL`), so the http(s)
// shape is checked structurally here. The main-process adapter parses the URL for
// real before it ever opens a socket.
const HTTP_URL = /^https?:\/\/[^\s/]+/i;

export const joinCenterSchema = z.object({
  baseUrls: z
    .array(z.string().refine((value) => HTTP_URL.test(value), { message: 'hub URL must be an http(s) address' }))
    .min(1),
  token: z.string().min(1),
  centerCode: z.string().min(1),
});

export type JoinCenterFormInput = z.infer<typeof joinCenterSchema>;
