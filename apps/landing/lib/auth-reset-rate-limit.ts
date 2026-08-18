import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Durable, per-endpoint throttles for the password-reset relay (SOU-157).
// Upstash is the source of truth; without credentials (local dev) we fail OPEN
// so the flow stays testable — production sets the env vars. This deliberately
// replaces the serverless in-memory-Map problem flagged in SOU-207.

const hasUpstashCredentials =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

type Window = Parameters<typeof Ratelimit.slidingWindow>[1];

function buildLimiter(limit: number, window: Window, prefix: string): Ratelimit | null {
  if (!hasUpstashCredentials) return null;
  try {
    return new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix,
    });
  } catch {
    return null;
  }
}

// reset-request: a legitimate user asks for very few codes.
const requestByEmail = buildLimiter(5, "1 h", "csreset:req:email");
const requestByIp = buildLimiter(20, "1 h", "csreset:req:ip");
// reset-confirm: allow a handful of typos, still cap brute force hard.
const confirmByEmail = buildLimiter(10, "15 m", "csreset:cfm:email");
const confirmByIp = buildLimiter(30, "15 m", "csreset:cfm:ip");

if (!hasUpstashCredentials) {
  console.warn(
    "[auth-reset] UPSTASH_REDIS_REST_URL/TOKEN missing; reset rate limiting disabled (dev only)",
  );
}

async function passes(limiter: Ratelimit | null, identifier: string): Promise<boolean> {
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit(identifier);
    return success;
  } catch (err) {
    // Log a stable code only — err.message may echo the REST endpoint URL.
    console.warn(
      "[auth-reset] Upstash rate-limit check failed; allowing request",
      err instanceof Error ? err.constructor.name : "unknown",
    );
    return true;
  }
}

// `emailHash` and `ipHash` must already be one-way hashes — no PII to Upstash.
type ResetRateLimitKeys = { emailHash: string; ipHash: string };

/** True when the reset-request is allowed; false when either limit is hit. */
export async function checkResetRequestRateLimit({
  emailHash,
  ipHash,
}: ResetRateLimitKeys): Promise<boolean> {
  const [emailOk, ipOk] = await Promise.all([
    passes(requestByEmail, emailHash),
    passes(requestByIp, ipHash),
  ]);
  return emailOk && ipOk;
}

/** True when the reset-confirm is allowed; false when either limit is hit. */
export async function checkResetConfirmRateLimit({
  emailHash,
  ipHash,
}: ResetRateLimitKeys): Promise<boolean> {
  const [emailOk, ipOk] = await Promise.all([
    passes(confirmByEmail, emailHash),
    passes(confirmByIp, ipHash),
  ]);
  return emailOk && ipOk;
}
