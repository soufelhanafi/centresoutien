import { createHash, randomInt } from "node:crypto";
import { Redis } from "@upstash/redis";
import { z } from "zod";

// Single-use email verification codes for the desktop password-reset flow
// (SOU-157). The relay proves the user controls the mailbox and issues a
// short-lived code; it never sees passwords and never stores a plaintext code.

const CODE_TTL_SECONDS = 20 * 60;
const KEY_PREFIX = "pwreset";
// Prefix the stored value so @upstash/redis never coerces an all-digit hash
// into a number on read.
const VALUE_PREFIX = "v1:";
// Mirrors the domain Email VO's EMAIL_MAX_LENGTH (RFC 5321 max, 254). A shorter
// cap here would reject addresses the desktop already accepted and stored,
// locking valid owners out of the advertised reset flow.
const EMAIL_MAX_LENGTH = 254;

/** Body of `POST /api/auth/reset-request`. */
export const resetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(EMAIL_MAX_LENGTH),
  accountId: z.string().trim().min(1).max(128),
  centerCode: z.string().trim().min(1).max(64),
});
export type ResetRequest = z.infer<typeof resetRequestSchema>;

/** Body of `POST /api/auth/reset-confirm`. */
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

/** Cryptographically-random 6-digit numeric code (unbiased). */
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

// Outcome of an atomic verify-and-consume against the code store.
//  - "matched"  : the stored hash equaled the submission and was deleted (single use)
//  - "mismatch" : a code exists but differs — LEFT IN PLACE so a wrong guess never
//                 burns the legitimate (possibly newer) code
//  - "absent"   : no live code for the identity (expired, unknown, or already used)
type ConsumeOutcome = "matched" | "mismatch" | "absent";

type ResetCodeStore = {
  put: (key: string, hash: string) => Promise<void>;
  // Atomic compare-and-delete: reads, compares, and deletes in one step so two
  // concurrent confirms can never observe or burn each other's code. The delete
  // fires ONLY on an exact match, which also enforces latest-code binding — a
  // stale hash can never consume a value that a newer request replaced.
  compareAndConsume: (key: string, hash: string) => Promise<ConsumeOutcome>;
};

// KEYS[1] = storage key, ARGV[1] = stored representation of the submitted hash.
// Returns 1 matched(+deleted), 2 mismatch(kept), 0 absent. Server-side eval is
// atomic, closing the peek-then-consume race; a peppered sha256 compared inside
// Redis is not a practical timing oracle over the network.
const COMPARE_AND_CONSUME_LUA = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
if current == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 1
end
return 2`;

function outcomeFromCode(code: number): ConsumeOutcome {
  if (code === 1) return "matched";
  if (code === 2) return "mismatch";
  return "absent";
}

function createUpstashStore(redis: Redis): ResetCodeStore {
  return {
    async put(key, hash) {
      await redis.set(key, `${VALUE_PREFIX}${hash}`, { ex: CODE_TTL_SECONDS });
    },
    async compareAndConsume(key, hash) {
      const result = await redis.eval(
        COMPARE_AND_CONSUME_LUA,
        [key],
        [`${VALUE_PREFIX}${hash}`],
      );
      return outcomeFromCode(Number(result));
    },
  };
}

// In-memory fallback for local dev only, so the flow stays testable without
// Upstash credentials. Not durable and not shared across serverless
// instances — production must configure Upstash (enforced below).
function createInMemoryStore(): ResetCodeStore {
  const entries = new Map<string, { hash: string; expiresAt: number }>();
  const readFresh = (key: string): string | null => {
    const entry = entries.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      entries.delete(key);
      return null;
    }
    return entry.hash;
  };
  return {
    async put(key, hash) {
      entries.set(key, { hash, expiresAt: Date.now() + CODE_TTL_SECONDS * 1000 });
    },
    async compareAndConsume(key, hash) {
      const current = readFresh(key);
      if (current === null) return "absent";
      if (current !== hash) return "mismatch";
      entries.delete(key);
      return "matched";
    },
  };
}

let cachedStore: ResetCodeStore | null = null;

function resetCodeStore(): ResetCodeStore {
  if (cachedStore) return cachedStore;
  const hasUpstashCredentials =
    Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
    Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);
  if (hasUpstashCredentials) {
    cachedStore = createUpstashStore(Redis.fromEnv());
  } else {
    if (process.env.NODE_ENV === "production") {
      throw new Error("reset_store_not_configured");
    }
    console.warn("[auth-reset] Upstash not configured — using in-memory store (dev only)");
    cachedStore = createInMemoryStore();
  }
  return cachedStore;
}

/**
 * Persists only the hash of an already-generated code under a TTL. Kept separate
 * from code generation so the caller can email the code and persist ONLY on a
 * successful send — a failed delivery must never overwrite (destroy) a prior
 * live code. The plaintext code is never persisted or logged.
 */
export async function persistResetCode(
  identity: ResetIdentity,
  code: string,
): Promise<void> {
  const hash = hashResetCode({ ...identity, code });
  await resetCodeStore().put(storageKey(identity), hash);
}

/**
 * Verifies a submitted code and, on an exact match, atomically consumes it
 * (single use). Returns false for any failure — expired, unknown, mismatched,
 * or already used — so the caller can emit one generic error. A wrong guess
 * returns false WITHOUT deleting the stored code, so brute-force attempts
 * (rate-limited elsewhere) never lock out the legitimate holder.
 */
export async function verifyAndConsumeResetCode(
  submission: ResetIdentity & { code: string },
): Promise<boolean> {
  const key = storageKey(submission);
  const submittedHash = hashResetCode(submission);
  const outcome = await resetCodeStore().compareAndConsume(key, submittedHash);
  return outcome === "matched";
}

/** One-way, truncated hash of an email for audit logs (never store PII). */
function requiredSalt(envVar: string, devFallback: string): string {
  const value = process.env[envVar];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${envVar.toLowerCase()}_not_configured`);
  }
  return devFallback;
}

export function hashEmailForAudit(email: string): string {
  const salt = requiredSalt("AUDIT_HASH_SALT", "centresoutien-audit-dev-only");
  return createHash("sha256")
    .update(`${salt}:${normalizeEmail(email)}`)
    .digest("hex")
    .slice(0, 16);
}

/** One-way, truncated hash of a client IP for rate-limit keys and audit logs. */
export function hashIpForAudit(ip: string): string {
  const salt = requiredSalt("IP_HASH_SALT", "centresoutien-ip-dev-only");
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16);
}

/**
 * Extracts the client IP from request headers. Prefers the platform-set
 * Netlify header, then `x-real-ip`, then the RIGHTMOST `x-forwarded-for` entry
 * — the leftmost value is attacker-controlled and must never key the limiter
 * (SOU-207).
 */
export function extractClientIp(headers: Headers): string {
  const netlifyIp = headers.get("x-nf-client-connection-ip")?.trim();
  if (netlifyIp) return netlifyIp;
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded.at(-1) ?? "unknown";
}
