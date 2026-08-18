import { Redis } from "@upstash/redis";

// The durable store for single-use reset-code hashes (SOU-157). Only hashes ever
// land here — never a plaintext code. Upstash is the production store; an
// in-memory fallback keeps the flow testable in dev without credentials.

const CODE_TTL_SECONDS = 20 * 60;
// Prefix the stored value so @upstash/redis never coerces an all-digit hash into
// a number on read.
const VALUE_PREFIX = "v1:";

// Outcome of an atomic verify-and-consume against the code store.
//  - "matched"  : the stored hash equaled the submission and was deleted (single use)
//  - "mismatch" : a code exists but differs — LEFT IN PLACE so a wrong guess never
//                 burns the legitimate (possibly newer) code
//  - "absent"   : no live code for the identity (expired, unknown, or already used)
export type ConsumeOutcome = "matched" | "mismatch" | "absent";

export type ResetCodeStore = {
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
      const result = await redis.eval(COMPARE_AND_CONSUME_LUA, [key], [`${VALUE_PREFIX}${hash}`]);
      return outcomeFromCode(Number(result));
    },
  };
}

// In-memory fallback for local dev only, so the flow stays testable without
// Upstash credentials. Not durable and not shared across serverless instances —
// production must configure Upstash (enforced below).
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

export function resetCodeStore(): ResetCodeStore {
  if (cachedStore) return cachedStore;
  const hasUpstashCredentials =
    Boolean(process.env.UPSTASH_REDIS_REST_URL) && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);
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
