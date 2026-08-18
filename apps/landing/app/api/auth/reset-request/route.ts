import { NextResponse } from "next/server";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkResetRequestRateLimit } from "@/lib/auth-reset-rate-limit";
import {
  extractClientIp,
  generateResetCode,
  hashEmailForAudit,
  hashIpForAudit,
  persistResetCode,
  resetRequestSchema,
} from "@/lib/auth-reset";

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

  try {
    // Send BEFORE persisting: a failed delivery must not overwrite a prior live
    // code. The identity's existing code stays usable and the new one is dropped.
    const code = generateResetCode();
    await sendPasswordResetEmail({ to: email, code });
    await persistResetCode({ email, accountId }, code);
    audit({ emailHash, outcome: "sent" });
  } catch {
    // Never surface internal failures to the caller — a differing response
    // would leak signal. Log a stable outcome only (no PII, no error message).
    audit({ emailHash, outcome: "send_failed" });
  }

  // `centerCode` is validated so malformed desktop calls are rejected; it is
  // not needed to issue the code and is intentionally never logged.
  void centerCode;
  return NextResponse.json(GENERIC_OK, { status: 200 });
}
