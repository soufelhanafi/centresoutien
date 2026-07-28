"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { founderApplicationSchema } from "@/lib/validators";
import { sendFounderNotification } from "@/lib/email";

export type FounderFormState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      error: "validation_failed" | "server_error";
      fieldErrors?: Record<string, string>;
    };

// Best-effort in-memory throttle (per instance; not durable — see spec §11).
const lastSubmissionByIp = new Map<string, number>();

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
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  const ipHash = hashIp(ip);

  const now = Date.now();
  const last = lastSubmissionByIp.get(ipHash);
  if (last && now - last < 60_000) {
    return { status: "error", error: "server_error" };
  }
  lastSubmissionByIp.set(ipHash, now);

  try {
    await sendFounderNotification(parsed.data, {
      submittedAt: new Date().toISOString(),
      ipHash,
      userAgent: h.get("user-agent") ?? "unknown",
    });
    return { status: "success" };
  } catch {
    return { status: "error", error: "server_error" };
  }
}
