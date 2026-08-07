import { z } from 'zod';

/**
 * Structural guards for the license file (SOU-98). The Ed25519 signature proves
 * authenticity; these schemas prove *shape* — a signed-but-malformed payload
 * (e.g. an unknown plan tier) is rejected rather than trusted. Kept in the domain
 * so the claim contract lives beside {@link LicenseClaims}; the adapter parses
 * with them after the signature check.
 */

/** The on-disk envelope: base64 claims bytes (what the signature covers) + signature. */
export const licenseFileSchema = z.object({
  claims: z.string().min(1),
  signature: z.string().min(1),
});

export type LicenseFileInput = z.infer<typeof licenseFileSchema>;

/** The decoded claim set. `plan` mirrors {@link PlanId}; the tier registry test guards drift. */
export const licenseClaimsSchema = z.object({
  plan: z.enum(['essentiel', 'pro', 'premium']),
  issuedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  machineId: z.string().min(1).nullable(),
  centerCode: z.string().min(1).nullable(),
});
