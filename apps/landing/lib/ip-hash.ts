import { createHash } from "node:crypto";

/*
 * One-way hash of a client IP for rate limiting only. Shared by every server
 * action that keys the limiter on the visitor, so the salt and digest length
 * can never drift between forms (a drift would split the rate-limit buckets and
 * weaken the throttle). A raw IP is never persisted or sent to Upstash.
 */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT ?? "centresoutien";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16);
}
