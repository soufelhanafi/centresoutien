"use server";

import { headers } from "next/headers";
import { downloadLeadSchema } from "@/lib/validators";
import { sendDownloadLeadNotification } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashIp } from "@/lib/ip-hash";

export type DownloadLeadState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      error: "validation_failed" | "server_error";
      fieldErrors?: Record<string, string>;
    };

export async function submitDownloadLead(
  _prev: DownloadLeadState,
  formData: FormData,
): Promise<DownloadLeadState> {
  // Honeypot: bots fill hidden fields. Accept silently, do nothing.
  if (((formData.get("website") as string) ?? "").length > 0) {
    return { status: "success" };
  }

  const parsed = downloadLeadSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    consent: formData.get("consent") === "on",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = "invalid";
      }
    }
    return { status: "error", error: "validation_failed", fieldErrors };
  }

  const h = await headers();
  // Trust the platform-set `x-real-ip` when present; otherwise take the
  // RIGHTMOST `x-forwarded-for` entry — Vercel appends the real client IP at
  // the end, so the leftmost value is attacker-controlled and must never key
  // the limiter (SOU-207).
  const forwarded = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const ip = h.get("x-real-ip")?.trim() || forwarded.at(-1) || "unknown";
  // Scoped under a distinct key so a download lead never throttles (or is
  // throttled by) a founder application from the same IP.
  const ipHash = `download:${hashIp(ip)}`;

  if (!(await checkRateLimit(ipHash))) {
    return { status: "error", error: "server_error" };
  }

  try {
    await sendDownloadLeadNotification(parsed.data, {
      submittedAt: new Date().toISOString(),
      ipHash,
      userAgent: h.get("user-agent") ?? "unknown",
    });
    return { status: "success" };
  } catch (err) {
    // Log only the stable failure code — never Resend's message (may echo
    // recipient data) nor any form contents.
    console.error(
      "[download-lead] submission failed",
      err instanceof Error ? err.message : "unknown",
    );
    return { status: "error", error: "server_error" };
  }
}
