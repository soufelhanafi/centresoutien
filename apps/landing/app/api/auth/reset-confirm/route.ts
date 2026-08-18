import { NextResponse } from "next/server";
import { checkResetConfirmRateLimit } from "@/lib/auth-reset-rate-limit";
import {
  extractClientIp,
  hashEmailForAudit,
  hashIpForAudit,
  resetConfirmSchema,
  verifyAndConsumeResetCode,
} from "@/lib/auth-reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One generic error for every failure path (expired, unknown, mismatched,
// already used) so the response never leaks which check failed.
const GENERIC_ERROR = { ok: false, error: "invalid_or_expired" } as const;

function audit(fields: { emailHash: string; outcome: string }): void {
  console.info(
    JSON.stringify({
      event: "auth.reset.confirm",
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
    return NextResponse.json(GENERIC_ERROR, { status: 400 });
  }

  const parsed = resetConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(GENERIC_ERROR, { status: 400 });
  }
  const { email, accountId, code } = parsed.data;
  const emailHash = hashEmailForAudit(email);
  const ipHash = hashIpForAudit(extractClientIp(request.headers));

  if (!(await checkResetConfirmRateLimit({ emailHash, ipHash }))) {
    audit({ emailHash, outcome: "rate_limited" });
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const valid = await verifyAndConsumeResetCode({ email, accountId, code });
  if (!valid) {
    audit({ emailHash, outcome: "invalid" });
    return NextResponse.json(GENERIC_ERROR, { status: 400 });
  }

  audit({ emailHash, outcome: "confirmed" });
  return NextResponse.json({ ok: true }, { status: 200 });
}
