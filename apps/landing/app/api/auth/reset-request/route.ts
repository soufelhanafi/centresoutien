import { NextResponse } from "next/server";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkResetRequestRateLimit } from "@/lib/auth-reset-rate-limit";
import { extractClientIp, hashEmailForAudit, hashIpForAudit } from "@/lib/auth-audit";
import { generateResetCode, persistResetCode, resetRequestSchema } from "@/lib/auth-reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generic body returned no matter what happens — the relay never reveals
// whether an account exists (no enumeration) nor whether the send succeeded.
const GENERIC_OK = { ok: true } as const;

function audit(fields: { emailHash: string; outcome: string }): void {
  console.info(
    JSON.stringify({
      event: "auth.reset.request",
      emailHash: fields.emailHash,
      outcome: fields.outcome,
      at: new Date().toISOString(),
    }),
  );
}

// Issues a code and emails it, persisting ONLY after a successful send so a
// failed delivery cannot overwrite (destroy) a prior live code. Returns the
// audit outcome; never throws — an internal failure must not change the caller's
// generic response (no enumeration, no send-success signal).
async function issueResetCode(email: string, accountId: string): Promise<"sent" | "send_failed"> {
  try {
    const code = generateResetCode();
    await sendPasswordResetEmail({ to: email, code });
    await persistResetCode({ email, accountId }, code);
    return "sent";
  } catch {
    return "send_failed";
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const parsed = resetRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  const { email, accountId, centerCode } = parsed.data;
  const emailHash = hashEmailForAudit(email);
  const ipHash = hashIpForAudit(extractClientIp(request.headers));

  if (!(await checkResetRequestRateLimit({ emailHash, ipHash }))) {
    audit({ emailHash, outcome: "rate_limited" });
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  // `centerCode` is validated so malformed desktop calls are rejected; it is
  // not needed to issue the code and is intentionally never logged.
  void centerCode;
  audit({ emailHash, outcome: await issueResetCode(email, accountId) });
  return NextResponse.json(GENERIC_OK, { status: 200 });
}
