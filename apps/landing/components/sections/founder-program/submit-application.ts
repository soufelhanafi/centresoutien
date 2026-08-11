"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { founderApplicationSchema } from "@/lib/validators";
import { sendFounderNotification } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";

export type FounderFormState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      error: "validation_failed" | "server_error";
      fieldErrors?: Record<string, string>;
    };

function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT ?? "centresoutien";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16);
}

export async function submitFounderApplication(
  _prev: FounderFormState,
  formData: FormData,
): Promise<FounderFormState> {
  // Honeypot: bots fill hidden fields. Accept silently, do nothing.
  if (((formData.get("website") as string) ?? "").length > 0) {
    return { status: "success" };
  }

  const parsed = founderApplicationSchema.safeParse({
    centerName: formData.get("centerName"),
    city: formData.get("city"),
    studentsRange: formData.get("studentsRange"),
    email: formData.get("email"),
    phone: formData.get("phone"),
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
  const ipHash = hashIp(ip);

  if (!(await checkRateLimit(ipHash))) {
    return { status: "error", error: "server_error" };
  }

  try {
    await sendFounderNotification(parsed.data, {
      submittedAt: new Date().toISOString(),
      ipHash,
      userAgent: h.get("user-agent") ?? "unknown",
    });
    return { status: "success" };
  } catch (err) {
    // Log only the stable failure code — never Resend's message (may echo
    // recipient data) nor any form contents.
    console.error(
      "[founder] submission failed",
      err instanceof Error ? err.message : "unknown",
    );
    return { status: "error", error: "server_error" };
  }
}
