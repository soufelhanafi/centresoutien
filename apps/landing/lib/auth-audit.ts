import { createHash } from "node:crypto";

// One-way hashing + client-IP extraction for the reset relay's audit trail and
// rate-limit keys (SOU-157 / SOU-207). Nothing here ever stores or logs raw PII
// — only salted, truncated digests leave this module.

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Reads a required audit salt from the environment. A missing salt is a
// deployment fault in production (throws, so the audit hash is never silently
// unsalted); in dev it falls back to an inert constant so the flow stays
// testable.
function auditSalt(envVar: "AUDIT_HASH_SALT" | "IP_HASH_SALT", devFallback: string): string {
  const value = process.env[envVar];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${envVar.toLowerCase()}_not_configured`);
  }
  return devFallback;
}

// One-way, truncated hash of an email for audit logs (never store PII).
export function hashEmailForAudit(email: string): string {
  const salt = auditSalt("AUDIT_HASH_SALT", "centresoutien-audit-dev-only");
  return createHash("sha256")
    .update(`${salt}:${normalizeEmail(email)}`)
    .digest("hex")
    .slice(0, 16);
}

// One-way, truncated hash of a client IP for rate-limit keys and audit logs.
export function hashIpForAudit(ip: string): string {
  const salt = auditSalt("IP_HASH_SALT", "centresoutien-ip-dev-only");
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16);
}

// Extracts the client IP from request headers. Prefers the platform-set Netlify
// header, then `x-real-ip`, then the RIGHTMOST `x-forwarded-for` entry — the
// leftmost value is attacker-controlled and must never key the limiter (SOU-207).
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
