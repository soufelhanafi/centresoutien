import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Durable lead-form throttle. Upstash is the source of truth when credentials
// exist; without them (local dev) we fail OPEN to the per-instance in-memory
// stopgap below. KICKOFF decision: a lead form may accept a rare duplicate
// rather than drop a real application on a Redis outage.
const WINDOW_MS = 60_000;
const MAX_FALLBACK_ENTRIES = 5_000;
const lastSeenFallback = new Map<string, number>();

const hasUpstashCredentials =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

let ratelimit: Ratelimit | null = null;
try {
  ratelimit = hasUpstashCredentials
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(1, "60 s"),
        prefix: "centresoutien",
      })
    : null;
} catch {
  ratelimit = null;
}

if (!ratelimit) {
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN missing; throttling via per-instance in-memory map (not durable)",
  );
}

/**
 * Returns true to allow the request through, false to throttle. `identifier`
 * must already be a one-way hash — a raw IP is never sent to Upstash.
 */
export async function checkRateLimit(identifier: string): Promise<boolean> {
  if (ratelimit) {
    try {
      const { success } = await ratelimit.limit(identifier);
      return success;
    } catch (err) {
      // Log a stable code only — err.message may echo the REST endpoint URL.
      console.warn(
        "[rate-limit] Upstash check failed; using in-memory fallback",
        err instanceof Error ? err.constructor.name : "unknown",
      );
    }
  }
  const now = Date.now();
  // Prune expired identifiers (Map preserves insertion order, so the first
  // still-fresh entry means everything after it is fresh too).
  for (const [key, last] of lastSeenFallback) {
    if (now - last < WINDOW_MS) break;
    lastSeenFallback.delete(key);
  }
  // Bounded memory even under many distinct identifiers (e.g. a NAT IP pool).
  while (lastSeenFallback.size >= MAX_FALLBACK_ENTRIES) {
    const oldest = lastSeenFallback.keys().next().value;
    if (oldest === undefined) break;
    lastSeenFallback.delete(oldest);
  }
  const last = lastSeenFallback.get(identifier);
  if (last && now - last < WINDOW_MS) return false;
  lastSeenFallback.set(identifier, now);
  return true;
}
