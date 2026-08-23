import { createHash, randomInt } from "node:crypto";
import { z } from "zod";
import { resetCodeStore } from "./auth-reset-store";

// Single-use email verification codes for the desktop password-reset flow
// (SOU-157). The relay proves the user controls the mailbox and issues a
// short-lived code; it never sees passwords and never stores a plaintext code.

const KEY_PREFIX = "pwreset";
// Mirrors the domain Email VO's EMAIL_MAX_LENGTH (RFC 5321 max, 254). A shorter
// cap here would reject addresses the desktop already accepted and stored,
// locking valid owners out of the advertised reset flow.
const EMAIL_MAX_LENGTH = 254;

// The desktop UI locale, carried so the emailed code lands in the language the
// owner is reading (SOU-273). Optional + defaulted to French so an older desktop
// build that omits it still gets a valid — French — email rather than a rejection.
export const resetLocaleSchema = z.enum(["fr", "ar"]).default("fr");
export type ResetLocale = z.infer<typeof resetLocaleSchema>;

// Body of `POST /api/auth/reset-request`.
export const resetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(EMAIL_MAX_LENGTH),
  accountId: z.string().trim().min(1).max(128),
  centerCode: z.string().trim().min(1).max(64),
  locale: resetLocaleSchema,
});
export type ResetRequest = z.infer<typeof resetRequestSchema>;

// Body of `POST /api/auth/reset-confirm`.
export const resetConfirmSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(EMAIL_MAX_LENGTH),
  accountId: z.string().trim().min(1).max(128),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});
export type ResetConfirm = z.infer<typeof resetConfirmSchema>;

type ResetIdentity = { email: string; accountId: string };

// Cryptographically-random 6-digit numeric code (unbiased).
export function generateResetCode(): string {
  return randomInt(0, 1_000_000)
    .toString()
    .padStart(6, "0");
}

// A server-side pepper makes an offline brute force of the 6-digit space
// infeasible from a Redis dump alone (the pepper is never stored).
function codePepper(): string {
  const pepper = process.env.RESET_CODE_PEPPER;
  if (pepper) return pepper;
  if (process.env.NODE_ENV === "production") {
    throw new Error("reset_pepper_not_configured");
  }
  return "centresoutien-reset-pepper-dev-only";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashResetCode({ email, accountId, code }: ResetIdentity & { code: string }): string {
  return createHash("sha256")
    .update(`${codePepper()}:${normalizeEmail(email)}:${accountId}:${code}`)
    .digest("hex");
}

function storageKey({ email, accountId }: ResetIdentity): string {
  const identityHash = createHash("sha256")
    .update(`${normalizeEmail(email)}:${accountId}`)
    .digest("hex")
    .slice(0, 32);
  return `${KEY_PREFIX}:${identityHash}`;
}

// Persists only the hash of an already-generated code under a TTL. Kept separate
// from code generation so the caller can email the code and persist ONLY on a
// successful send — a failed delivery must never overwrite (destroy) a prior
// live code. The plaintext code is never persisted or logged.
export async function persistResetCode(identity: ResetIdentity, code: string): Promise<void> {
  const hash = hashResetCode({ ...identity, code });
  await resetCodeStore().put(storageKey(identity), hash);
}

// Verifies a submitted code and, on an exact match, atomically consumes it
// (single use). Returns false for any failure — expired, unknown, mismatched, or
// already used — so the caller can emit one generic error. A wrong guess returns
// false WITHOUT deleting the stored code, so brute-force attempts (rate-limited
// elsewhere) never lock out the legitimate holder.
export async function verifyAndConsumeResetCode(
  submission: ResetIdentity & { code: string },
): Promise<boolean> {
  const key = storageKey(submission);
  const submittedHash = hashResetCode(submission);
  const outcome = await resetCodeStore().compareAndConsume(key, submittedHash);
  return outcome === "matched";
}
