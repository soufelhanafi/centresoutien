import { Redis } from "@upstash/redis";
import { hashEmailForSuppression } from "./auth-audit";

// Durable suppression list for SES outbound (SOU-274). A hard bounce or a spam
// complaint records the address here so we never send to it again — protecting
// the sending identity's reputation. Only a salted hash of the address is ever
// stored (never a plaintext recipient — PII / loi 09-08). Upstash is the
// production store; an in-memory fallback keeps the flow testable in dev without
// credentials.

const KEY_PREFIX = "suppressed";

// Why an address is suppressed. Kept for the audit trail; never surfaced to the
// send path, which only asks the yes/no question.
export type SuppressionReason = "bounce" | "complaint";

// Suppressions are permanent by design: a mailbox that hard-bounced or reported
// us as spam does not "recover" on a timer, and re-sending is exactly the
// behaviour that gets a sending identity throttled. Stored with no TTL.
export type SuppressionStore = {
  suppress: (email: string, reason: SuppressionReason) => Promise<void>;
  isSuppressed: (email: string) => Promise<boolean>;
};

function suppressionKey(email: string): string {
  return `${KEY_PREFIX}:${hashEmailForSuppression(email)}`;
}

// The stored value is metadata for the audit trail only — the send path reads
// existence, never the payload. `at` is set by the writer, not read back.
type SuppressionRecord = { reason: SuppressionReason; at: string };

function createUpstashStore(redis: Redis): SuppressionStore {
  return {
    async suppress(email, reason) {
      const record: SuppressionRecord = { reason, at: new Date().toISOString() };
      await redis.set(suppressionKey(email), JSON.stringify(record));
    },
    async isSuppressed(email) {
      const value = await redis.get(suppressionKey(email));
      return value !== null;
    },
  };
}

// In-memory fallback for local dev only, so the flow stays testable without
// Upstash credentials. Not durable and not shared across serverless instances —
// production must configure Upstash (enforced below). Exported so tests can
// build a fresh, isolated instance instead of leaning on the module singleton.
export function createInMemorySuppressionStore(): SuppressionStore {
  const suppressed = new Set<string>();
  return {
    async suppress(email) {
      suppressed.add(suppressionKey(email));
    },
    async isSuppressed(email) {
      return suppressed.has(suppressionKey(email));
    },
  };
}

let cachedStore: SuppressionStore | null = null;

export function suppressionStore(): SuppressionStore {
  if (cachedStore) return cachedStore;
  const hasUpstashCredentials =
    Boolean(process.env.UPSTASH_REDIS_REST_URL) && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);
  if (hasUpstashCredentials) {
    cachedStore = createUpstashStore(Redis.fromEnv());
  } else {
    if (process.env.NODE_ENV === "production") {
      throw new Error("suppression_store_not_configured");
    }
    console.warn("[ses-suppression] Upstash not configured — using in-memory store (dev only)");
    cachedStore = createInMemorySuppressionStore();
  }
  return cachedStore;
}

// One warning is enough to alert ops without flooding logs on a sustained outage.
let suppressionReadFailureLogged = false;

// Reads the suppression list without ever letting a store outage block a send.
// The account-level SES suppression list (enabled in ops) is the durable
// backstop, so failing OPEN here trades a single possibly-wasted send during an
// Upstash outage for never denying a legitimate owner their recovery email.
export async function isEmailSuppressed(email: string, store?: SuppressionStore): Promise<boolean> {
  try {
    return await (store ?? suppressionStore()).isSuppressed(email);
  } catch (error) {
    // Fail open, but leave one operational breadcrumb (PII-free — no address,
    // only the error name) so a misconfig/outage that silently disables
    // suppression is diagnosable rather than invisible.
    if (!suppressionReadFailureLogged) {
      suppressionReadFailureLogged = true;
      const name = error instanceof Error ? error.name : "unknown";
      console.warn(`[ses-suppression] read failed — failing open (error=${name})`);
    }
    return false;
  }
}
