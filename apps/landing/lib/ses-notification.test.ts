import { describe, expect, it, vi } from "vitest";
import {
  isAwsSnsUrl,
  parseSesSuppressionTargets,
  snsEnvelopeSchema,
  verifySnsMessageSignature,
  type SnsEnvelope,
} from "./ses-notification";

// A throwaway self-signed cert (CN=sns.us-east-1.amazonaws.com) and signatures
// PRE-COMPUTED offline with its now-discarded private key over the exact
// canonical strings below. Embedding the public cert + the signatures (never the
// private key) keeps a real RSA verification in the test without committing any
// secret material — a divergence in the production canonical-string builder still
// makes verify() fail, so this catches format drift, not just an equality check.
const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDLTCCAhWgAwIBAgIUXUGApsN7ZybL0/3y6anutrtOBfEwDQYJKoZIhvcNAQEL
BQAwJjEkMCIGA1UEAwwbc25zLnVzLWVhc3QtMS5hbWF6b25hd3MuY29tMB4XDTI2
MDgyMzE4Mzk1N1oXDTM2MDgyMDE4Mzk1N1owJjEkMCIGA1UEAwwbc25zLnVzLWVh
c3QtMS5hbWF6b25hd3MuY29tMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC
AQEAzaERUWX1G6uZTwcmDjcZgxDCa578S9EO63Snv6PlRnLu2mInv06ZzXi+13k7
M221xBLy7WKI2kzN9In/o3LRguN13v5SEQ+AOdTZOlOM5TjPU2oZHel3Twc+Zc6P
0udiCjKfNJnjrs3t2NEeacokYLChOowqEo38NC1GnXpPxuWrCTlVW+tsGmwbstzh
3v5FCVh6pHBfWoL6BpwvRIXnbn2euHVV75Sz9cBu2NfAr9xrLLTQS3WfMOW4mpK9
rRQ4ql2NY/ejnURMF6zX8PDEUiJ8zkJfWxOeeSCZHgi8Ee4YyLxmOk0PKeC+MQ1w
iP23ByQyWRuINYHbo6U1iSrE+wIDAQABo1MwUTAdBgNVHQ4EFgQU2fvV2lYdl0wv
t3S2S6l9bFKPTpYwHwYDVR0jBBgwFoAU2fvV2lYdl0wvt3S2S6l9bFKPTpYwDwYD
VR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAcEqFpc6eZMdtlwBTspku
OT0bTaH65AQ+fJajRxCfjyDVF9XpHoykpEMGe++L3tjufQ6eko7gD0ddOukD1cIB
IBT8/YV0wtqRlNgXJWnH41KmbZABvx28laYMUkQWLSXwLbZRfY//YFQFVLijIm1b
Q9B9VXArYMttkCuIQT7qNvvvKl6QJNBim/L24CA63gfYazreGhUyYrJ2rA7OzIaD
3AWp2K2CRi+CTdZFWhzcmmRIZ6eEF0CbdUU3MOxiMky7q/TixB/SHmVaIYxnB4L5
2yLyK8mZtkihXta2bwEPMu12Aut3GaBrxqA4fsJRWzRqt/jHAj7De2KUs/zkqTNI
vA==
-----END CERTIFICATE-----`;

const CERT_URL = "https://sns.us-east-1.amazonaws.com/cert.pem";
const TOPIC = "arn:aws:sns:us-east-1:111122223333:ses-events";
const TS = "2026-08-23T12:00:00.000Z";
const DELIVERY_MESSAGE = JSON.stringify({ notificationType: "Delivery" });

// Signature over the v1 canonical string of V1_NOTIFICATION (RSA-SHA1).
const SIG_V1_NOTIFICATION =
  "S6Pb+kYA8Tv9u5TKpjw9Nne4ZGaIGwDrJSSEsTdWlH6rOfuoqN0uM28EXpUkHqxKU5u6pfY4ISOAEVgCCV4hK1+TLwChG1ddH/XeuI4HEAzvlYDAqCBVLiI/GjZiwWAns4hufTP+nVtRLgORI+ql2rOXDmbsTMnOPp1sKwR2B795Gm95WRvTxj5T4pdQK+OEg63Ym3wX4188Z40DMfnq1t4NsJ7vpEulOTMCp3kUrDnWG5uFfs/t2IIHb1AeWYH6miQixbYSGLJ3HHIop65tJQ5BPU9ih+/cwg4pwIwsOy7bjnGex6V8aoCWPXIozmOdB19i1CKTVk+roLwPF2YFQA==";
// Signature over the v2 canonical string of V2_NOTIFICATION (RSA-SHA256).
const SIG_V2_NOTIFICATION =
  "DxtvGb8zUg0+hHK1j1IADpACVuKEAd7SH+Yx2sfOc3lfLvrxPc9VEFQDKn1TtZsyglVYeRTnL5/Ht8u/HxdLk0s1tUD3EHDjNKXkvqMHJOQDzE+k2LJzcJpU2sW1ZR7YY8Jjj1hkbWuvUo/SJy1RA6iyvlAFV5zXSF4B0ppFSdN6zhL9QSprc65+vFjDc8At59I+YYilb11y6IGOp2vdUgTHQNPjOpTvEgL2xiTFFn6ubnUKx6VNww3bpIAU+otenyOz0sgiFvBZcw0dxuRnTjHfl9UZFiq+zPC1zFHZP0QvJJdT9LyYiC7h57KwQRFbOko09TLPxTUe29ED/RL6Bw==";
// Signature over the canonical string of SUBSCRIPTION_CONFIRMATION (RSA-SHA1).
const SIG_SUBSCRIPTION =
  "D1SVmaUXCvHM3QPWft2AKKJT31AJTSSpwl0eSlpebhj2uLYWqUlozxqCtZd9RB31Wevy5jBsJTRHSU0nIM8E2bVYxAsyfONCgYohSmSb+z2zAW3AEQCLBkPEuRMy56909GSjU3I4mAW2tL34D4mowbxVZj/a7NPyW5JHqxF/2NpU4Mm/8TD7p5J2C4CAe/OqamVntF9w267szwFyI/topvVFY2PHLGaPhcuE3K+RdyT368w9XmsqSU5RwvkGK+EhCK6e0Dth5i7WMraQd4q9OOnnHB7mppMOOqV5woSyAH7qqrDAcIeKH6LbXRn5cXyPZYCxXLnw4IsDVng0S2IxFw==";

const V1_NOTIFICATION: SnsEnvelope = {
  Type: "Notification",
  MessageId: "msg-1",
  TopicArn: TOPIC,
  Message: DELIVERY_MESSAGE,
  Timestamp: TS,
  SignatureVersion: "1",
  Signature: SIG_V1_NOTIFICATION,
  SigningCertURL: CERT_URL,
  Subject: "Amazon SES Email Event Notification",
};

const V2_NOTIFICATION: SnsEnvelope = {
  Type: "Notification",
  MessageId: "msg-1",
  TopicArn: TOPIC,
  Message: DELIVERY_MESSAGE,
  Timestamp: TS,
  SignatureVersion: "2",
  Signature: SIG_V2_NOTIFICATION,
  SigningCertURL: CERT_URL,
};

const SUBSCRIPTION_CONFIRMATION: SnsEnvelope = {
  Type: "SubscriptionConfirmation",
  MessageId: "sub-1",
  TopicArn: TOPIC,
  Message: "You have chosen to subscribe",
  Timestamp: TS,
  SignatureVersion: "1",
  Signature: SIG_SUBSCRIPTION,
  SigningCertURL: CERT_URL,
  Token: "confirm-token",
  SubscribeURL: "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription",
};

const fetchCert = () => Promise.resolve(TEST_CERT);

describe("isAwsSnsUrl", () => {
  it("accepts an https amazonaws SNS host", () => {
    expect(isAwsSnsUrl("https://sns.us-east-1.amazonaws.com/x.pem")).toBe(true);
    expect(isAwsSnsUrl("https://sns.eu-west-3.amazonaws.com/x.pem")).toBe(true);
  });

  it("rejects non-https, foreign hosts, and suffix-spoofing", () => {
    expect(isAwsSnsUrl("http://sns.us-east-1.amazonaws.com/x.pem")).toBe(false);
    expect(isAwsSnsUrl("https://evil.com/x.pem")).toBe(false);
    expect(isAwsSnsUrl("https://sns.us-east-1.amazonaws.com.evil.com/x.pem")).toBe(false);
    expect(isAwsSnsUrl("https://internal-host/x.pem")).toBe(false);
    expect(isAwsSnsUrl("not-a-url")).toBe(false);
  });
});

describe("verifySnsMessageSignature", () => {
  it("accepts a correctly signed SignatureVersion 1 (RSA-SHA1) notification", async () => {
    expect(await verifySnsMessageSignature(V1_NOTIFICATION, fetchCert)).toBe(true);
  });

  it("accepts a correctly signed SignatureVersion 2 (RSA-SHA256) notification", async () => {
    expect(await verifySnsMessageSignature(V2_NOTIFICATION, fetchCert)).toBe(true);
  });

  it("accepts a correctly signed SubscriptionConfirmation", async () => {
    expect(await verifySnsMessageSignature(SUBSCRIPTION_CONFIRMATION, fetchCert)).toBe(true);
  });

  it("rejects a tampered message body", async () => {
    const tampered = { ...V1_NOTIFICATION, Message: JSON.stringify({ notificationType: "Bounce" }) };
    expect(await verifySnsMessageSignature(tampered, fetchCert)).toBe(false);
  });

  it("rejects a non-amazonaws signing cert URL without ever fetching it", async () => {
    const message = { ...V1_NOTIFICATION, SigningCertURL: "https://evil.com/cert.pem" };
    const spy = vi.fn(fetchCert);
    expect(await verifySnsMessageSignature(message, spy)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns false when the cert cannot be fetched", async () => {
    // A fresh (uncached) but still amazonaws-hosted cert URL, so the fetcher is
    // actually invoked rather than served from the per-URL cache the earlier
    // tests populated. SigningCertURL is not part of the signed canonical string,
    // so overriding it does not invalidate the signature.
    const message = {
      ...V1_NOTIFICATION,
      SigningCertURL: "https://sns.us-east-1.amazonaws.com/uncached-cert.pem",
    };
    const failing = () => Promise.reject(new Error("network"));
    expect(await verifySnsMessageSignature(message, failing)).toBe(false);
  });
});

describe("parseSesSuppressionTargets", () => {
  it("suppresses every recipient of a permanent bounce", () => {
    const message = JSON.stringify({
      notificationType: "Bounce",
      bounce: {
        bounceType: "Permanent",
        bouncedRecipients: [{ emailAddress: "a@example.com" }, { emailAddress: "b@example.com" }],
      },
    });
    expect(parseSesSuppressionTargets(message)).toEqual([
      { email: "a@example.com", reason: "bounce" },
      { email: "b@example.com", reason: "bounce" },
    ]);
  });

  it("ignores a transient bounce (temporary, safe to retry)", () => {
    const message = JSON.stringify({
      notificationType: "Bounce",
      bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "a@example.com" }] },
    });
    expect(parseSesSuppressionTargets(message)).toEqual([]);
  });

  it("suppresses every complained recipient", () => {
    const message = JSON.stringify({
      notificationType: "Complaint",
      complaint: { complainedRecipients: [{ emailAddress: "c@example.com" }] },
    });
    expect(parseSesSuppressionTargets(message)).toEqual([{ email: "c@example.com", reason: "complaint" }]);
  });

  it("yields nothing for a delivery or malformed payload", () => {
    expect(parseSesSuppressionTargets(JSON.stringify({ notificationType: "Delivery" }))).toEqual([]);
    expect(parseSesSuppressionTargets("not json")).toEqual([]);
    expect(parseSesSuppressionTargets(JSON.stringify({ notificationType: "Bounce" }))).toEqual([]);
  });
});

describe("snsEnvelopeSchema", () => {
  it("rejects an envelope missing the signature fields", () => {
    expect(snsEnvelopeSchema.safeParse({ Type: "Notification" }).success).toBe(false);
  });
});
