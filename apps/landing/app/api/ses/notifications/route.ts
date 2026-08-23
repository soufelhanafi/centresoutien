import { NextResponse } from "next/server";
import { hashEmailForAudit } from "@/lib/auth-audit";
import { suppressionStore } from "@/lib/suppression-store";
import {
  isAwsSnsUrl,
  parseSesSuppressionTargets,
  snsEnvelopeSchema,
  verifySnsMessageSignature,
  type SnsEnvelope,
} from "@/lib/ses-notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A bounded deadline on the subscription-confirmation callback so a stalled
// network path can't pin a serverless worker open.
const CONFIRM_FETCH_TIMEOUT_MS = 5000;

// SES bounce/complaint consumer (SOU-274). AWS SNS delivers notifications for the
// centresoutien.com sending identity here over an HTTPS subscription; a permanent
// bounce or a complaint suppresses the address so we never re-send to it. Every
// message is signature-verified before it is trusted (see ses-notification.ts).

function audit(fields: Record<string, string | number>): void {
  console.info(JSON.stringify({ event: "ses.notification", at: new Date().toISOString(), ...fields }));
}

// An optional topic allow-list: when SES_SNS_TOPIC_ARN is set, only that topic's
// messages are accepted, so a valid-but-unrelated SNS topic cannot drive
// suppressions even with a genuine AWS signature.
function isExpectedTopic(topicArn: string): boolean {
  const expected = process.env.SES_SNS_TOPIC_ARN;
  return !expected || expected === topicArn;
}

// SNS auto-subscription handshake: fetching the (host-validated) SubscribeURL
// confirms the subscription. The URL is validated as an amazonaws.com host first
// so a forged confirmation can never make us call an arbitrary endpoint.
async function confirmSubscription(message: SnsEnvelope): Promise<NextResponse> {
  if (!message.SubscribeURL || !isAwsSnsUrl(message.SubscribeURL)) {
    audit({ type: message.Type, outcome: "confirm_rejected" });
    return new NextResponse(null, { status: 400 });
  }
  try {
    await fetch(message.SubscribeURL, { signal: AbortSignal.timeout(CONFIRM_FETCH_TIMEOUT_MS) });
  } catch {
    audit({ type: message.Type, outcome: "confirm_fetch_failed" });
    return new NextResponse(null, { status: 502 });
  }
  audit({ type: message.Type, outcome: "confirmed" });
  return new NextResponse(null, { status: 200 });
}

async function recordSuppressions(message: SnsEnvelope): Promise<NextResponse> {
  const targets = parseSesSuppressionTargets(message.Message);
  // Deliveries, transient bounces, and malformed payloads yield no targets:
  // acknowledge them 200 without touching the store, so an Upstash outage or
  // misconfig never turns an irrelevant notification into a 500 + SNS retry.
  if (targets.length === 0) {
    audit({ type: "Notification", outcome: "no_targets" });
    return new NextResponse(null, { status: 200 });
  }
  try {
    const store = suppressionStore();
    for (const target of targets) {
      await store.suppress(target.email, target.reason);
      audit({ type: "Notification", reason: target.reason, emailHash: hashEmailForAudit(target.email) });
    }
  } catch {
    // A store outage must not be acknowledged as handled — returning non-2xx lets
    // SNS retry so the suppression is eventually durable.
    audit({ type: "Notification", outcome: "store_error", targets: targets.length });
    return new NextResponse(null, { status: 500 });
  }
  audit({ type: "Notification", outcome: "processed", suppressed: targets.length });
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const parsed = snsEnvelopeSchema.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const message = parsed.data;

  if (!isExpectedTopic(message.TopicArn)) return new NextResponse(null, { status: 403 });

  if (!(await verifySnsMessageSignature(message))) {
    audit({ type: message.Type, outcome: "signature_invalid" });
    return new NextResponse(null, { status: 403 });
  }

  if (message.Type === "SubscriptionConfirmation") return confirmSubscription(message);
  if (message.Type === "Notification") return recordSuppressions(message);

  audit({ type: message.Type, outcome: "ignored" });
  return new NextResponse(null, { status: 200 });
}
