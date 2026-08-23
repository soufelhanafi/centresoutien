import { createVerify, X509Certificate } from "node:crypto";
import { z } from "zod";
import type { SuppressionReason } from "./suppression-store";

// SNS message verification + SES notification parsing for the bounce/complaint
// consumer (SOU-274). An SNS HTTPS delivery is fully attacker-forgeable at the
// network layer: without signature verification, anyone could POST a fake
// "bounce" for a victim's recovery address and permanently deny them password
// resets. Nothing here is trusted until the signature checks out against a cert
// fetched from an amazonaws.com host.

// SNS delivers these three envelope types to an HTTPS endpoint.
const SNS_TYPES = ["Notification", "SubscriptionConfirmation", "UnsubscribeConfirmation"] as const;

export const snsEnvelopeSchema = z.object({
  Type: z.enum(SNS_TYPES),
  MessageId: z.string(),
  TopicArn: z.string(),
  Message: z.string(),
  Timestamp: z.string(),
  SignatureVersion: z.enum(["1", "2"]),
  Signature: z.string(),
  SigningCertURL: z.string().url(),
  Subject: z.string().optional(),
  Token: z.string().optional(),
  SubscribeURL: z.string().url().optional(),
  UnsubscribeURL: z.string().url().optional(),
});
export type SnsEnvelope = z.infer<typeof snsEnvelopeSchema>;

// True only for an `https://sns.<region>.amazonaws.com/...` URL. Guards both the
// signing-certificate fetch and the subscription-confirmation callback against
// SSRF — an attacker who controls `SigningCertURL`/`SubscribeURL` must not be
// able to point us at an internal host or an attacker-controlled cert.
export function isAwsSnsUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  return url.protocol === "https:" && /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(url.hostname);
}

// Canonical string-to-sign per the SNS signature spec: a fixed field order,
// each as `key\nvalue\n`. Field set and order differ by message type.
function stringToSign(message: SnsEnvelope): string {
  const fields: string[] =
    message.Type === "Notification"
      ? notificationSignFields(message)
      : subscriptionSignFields(message);
  return fields.map((line) => `${line}\n`).join("");
}

function notificationSignFields(message: SnsEnvelope): string[] {
  const fields = ["Message", message.Message, "MessageId", message.MessageId];
  if (message.Subject !== undefined) fields.push("Subject", message.Subject);
  fields.push("Timestamp", message.Timestamp, "TopicArn", message.TopicArn, "Type", message.Type);
  return fields;
}

function subscriptionSignFields(message: SnsEnvelope): string[] {
  return [
    "Message",
    message.Message,
    "MessageId",
    message.MessageId,
    "SubscribeURL",
    message.SubscribeURL ?? "",
    "Timestamp",
    message.Timestamp,
    "Token",
    message.Token ?? "",
    "TopicArn",
    message.TopicArn,
    "Type",
    message.Type,
  ];
}

export type CertFetcher = (url: string) => Promise<string>;

const CERT_FETCH_TIMEOUT_MS = 5000;

const defaultCertFetcher: CertFetcher = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(CERT_FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error("cert_fetch_failed");
  return response.text();
};

// A tiny bounded LRU. SNS rotates through only a handful of signing certs, so a
// small cap plus path-normalized keys keeps a long-lived (warm serverless)
// process from accumulating entries for querystring-varied URLs without bound.
const CERT_CACHE_LIMIT = 16;
const certCache = new Map<string, string>();

function certCacheKey(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

async function fetchSigningCert(url: string, fetcher: CertFetcher): Promise<string> {
  const key = certCacheKey(url);
  const cached = certCache.get(key);
  if (cached !== undefined) {
    certCache.delete(key);
    certCache.set(key, cached);
    return cached;
  }
  const pem = await fetcher(url);
  certCache.set(key, pem);
  if (certCache.size > CERT_CACHE_LIMIT) {
    const oldest = certCache.keys().next().value;
    if (oldest !== undefined) certCache.delete(oldest);
  }
  return pem;
}

// Verifies the RSA signature over the canonical string using the public key of
// the certificate at `SigningCertURL`. Returns false — never throws — on a bad
// host, an unfetchable/invalid cert, or a signature mismatch, so a forged or
// malformed message is dropped rather than crashing the endpoint.
export async function verifySnsMessageSignature(
  message: SnsEnvelope,
  fetcher: CertFetcher = defaultCertFetcher,
): Promise<boolean> {
  if (!isAwsSnsUrl(message.SigningCertURL)) return false;
  try {
    const pem = await fetchSigningCert(message.SigningCertURL, fetcher);
    const publicKey = new X509Certificate(pem).publicKey;
    const algorithm = message.SignatureVersion === "1" ? "RSA-SHA1" : "RSA-SHA256";
    const verifier = createVerify(algorithm);
    verifier.update(stringToSign(message), "utf8");
    verifier.end();
    return verifier.verify(publicKey, message.Signature, "base64");
  } catch {
    return false;
  }
}

// ---- SES notification payload (the inner `Message` JSON) --------------------

const sesRecipientSchema = z.object({ emailAddress: z.string() });

const sesMessageSchema = z.object({
  notificationType: z.string(),
  bounce: z
    .object({ bounceType: z.string(), bouncedRecipients: z.array(sesRecipientSchema) })
    .optional(),
  complaint: z.object({ complainedRecipients: z.array(sesRecipientSchema) }).optional(),
});

export type SuppressionTarget = { email: string; reason: SuppressionReason };

// Extracts the addresses that must be suppressed from a verified SES
// notification. Only PERMANENT bounces suppress — a transient bounce (full
// mailbox, greylisting) is temporary and re-sending later is legitimate.
// Complaints (spam reports) always suppress. Deliveries yield nothing.
export function parseSesSuppressionTargets(rawMessage: string): SuppressionTarget[] {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawMessage);
  } catch {
    return [];
  }
  const result = sesMessageSchema.safeParse(parsedJson);
  if (!result.success) return [];
  const message = result.data;

  if (message.notificationType === "Bounce" && message.bounce?.bounceType === "Permanent") {
    return message.bounce.bouncedRecipients.map((recipient) => ({
      email: recipient.emailAddress,
      reason: "bounce",
    }));
  }
  if (message.notificationType === "Complaint" && message.complaint) {
    return message.complaint.complainedRecipients.map((recipient) => ({
      email: recipient.emailAddress,
      reason: "complaint",
    }));
  }
  return [];
}
