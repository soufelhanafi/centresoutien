import { createHash, randomInt, timingSafeEqual } from "node:crypto";
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

/** Body of `POST /api/auth/reset-request`. */
export const resetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  accountId: z.string().trim().min(1).max(128),
  centerCode: z.string().trim().min(1).max(64),
});
export type ResetRequest = z.infer<typeof resetRequestSchema>;

/** Body of `POST /api/auth/reset-confirm`. */
export const resetConfirmSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
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

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

type ResetCodeStore = {
  put: (key: string, hash: string) => Promise<void>;
  peek: (key: string) => Promise<string | null>;
  // Atomic get-and-delete: deletion IS the single-use marker, so two
  // concurrent confirms can never both observe a live code.
  consume: (key: string) => Promise<string | null>;
};

function stripValuePrefix(raw: string | null): string | null {
  if (raw === null) return null;
  return raw.startsWith(VALUE_PREFIX) ? raw.slice(VALUE_PREFIX.length) : raw;
}

function createUpstashStore(redis: Redis): ResetCodeStore {
  return {
    async put(key, hash) {
      await redis.set(key, `${VALUE_PREFIX}${hash}`, { ex: CODE_TTL_SECONDS });
    },
    async peek(key) {
      return stripValuePrefix(await redis.get<string>(key));
    },
    async consume(key) {
      return stripValuePrefix(await redis.getdel<string>(key));
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
    async peek(key) {
      return readFresh(key);
    },
    async consume(key) {
      const hash = readFresh(key);
      if (hash !== null) entries.delete(key);
      return hash;
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
 * Generates a code, stores only its hash under a TTL, and returns the
 * plaintext code so the caller can email it. The plaintext is never persisted
 * or logged.
 */
export async function storeResetCode(identity: ResetIdentity): Promise<string> {
  const code = generateResetCode();
  const hash = hashResetCode({ ...identity, code });
  await resetCodeStore().put(storageKey(identity), hash);
  return code;
}

/**
 * Verifies a submitted code against the stored hash and, on success, atomically
 * consumes it (single use). Returns false for any failure — expired, unknown,
 * mismatched, or already used — so the caller can emit one generic error.
 */
export async function verifyAndConsumeResetCode(
  submission: ResetIdentity & { code: string },
): Promise<boolean> {
  const store = resetCodeStore();
  const key = storageKey(submission);
  const storedHash = await store.peek(key);
  if (storedHash === null) return false;
  const submittedHash = hashResetCode(submission);
  if (!timingSafeEqualHex(storedHash, submittedHash)) return false;
  const consumedHash = await store.consume(key);
  return consumedHash !== null;
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
