import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { Resend } from "resend";
import type { FounderApplication } from "@/lib/validators";

type SubmissionMeta = {
  submittedAt: string;
  ipHash: string;
  userAgent: string;
};

const STUDENT_RANGE_LABELS: Record<FounderApplication["studentsRange"], string> = {
  lt50: "< 50",
  "50-150": "50–150",
  "150-300": "150–300",
  gt300: "300+",
};

/*
 * Sends the team notification. Returns { sent: false } in development when
 * Resend is not configured (so the flow stays testable) and throws in
 * production — including when the Resend API itself reports an error, so the
 * caller never shows a success state for a lost application. Never logs PII.
 */
export async function sendFounderNotification(
  data: FounderApplication,
  meta: SubmissionMeta,
): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.FOUNDER_NOTIFICATION_EMAIL;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !to || !from) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("email_not_configured");
    }
    console.info("[founder] Resend not configured — email skipped (dev)");
    return { sent: false };
  }

  const resend = new Resend(apiKey);
  const text = [
    `Centre : ${data.centerName}`,
    `Ville : ${data.city}`,
    `Élèves : ${STUDENT_RANGE_LABELS[data.studentsRange]}`,
    `Email : ${data.email}`,
    `Téléphone : ${data.phone}`,
    "",
    `Soumis le : ${meta.submittedAt}`,
    `IP (hash) : ${meta.ipHash}`,
    `User-Agent : ${meta.userAgent}`,
  ].join("\n");

  const { error } = await resend.emails.send({
    from,
    to,
    replyTo: data.email,
    subject: `Candidature Programme Fondateur — ${data.centerName}`,
    text,
  });
  if (error) {
    // Deliberately opaque: Resend's message may echo recipient data.
    throw new Error("email_send_failed");
  }
  return { sent: true };
}

function passwordResetBody(code: string): string {
  // FR-only for v1 (SOU-157). Bilingual FR/AR is a follow-up once the desktop
  // reset UI settles its copy.
  return [
    "Bonjour,",
    "",
    "Vous avez demandé la réinitialisation de votre mot de passe Centre Soutien.",
    `Votre code de vérification est : ${code}`,
    "",
    "Ce code expire dans 20 minutes et ne peut être utilisé qu'une seule fois.",
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
    "",
    "L'équipe Centre Soutien",
  ].join("\n");
}

/*
 * Sends a single-use password-reset code via AWS SES (the SES key stays
 * server-side — it can never live in the Electron bundle). Returns
 * { sent: false } in development when SES is not configured (so the relay flow
 * stays testable) and throws in production. Never logs the code or the
 * recipient (PII / loi 09-08).
 */
export async function sendPasswordResetEmail(params: {
  to: string;
  code: string;
}): Promise<{ sent: boolean }> {
  const region = process.env.SES_REGION;
  const from = process.env.SES_FROM;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !from || !accessKeyId || !secretAccessKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("email_not_configured");
    }
    console.info("[reset] SES not configured — email skipped (dev)");
    return { sent: false };
  }

  const client = new SESClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    await client.send(
      new SendEmailCommand({
        Source: from,
        Destination: { ToAddresses: [params.to] },
        Message: {
          Subject: {
            Data: "Code de réinitialisation — Centre Soutien",
            Charset: "UTF-8",
          },
          Body: {
            Text: { Data: passwordResetBody(params.code), Charset: "UTF-8" },
          },
        },
      }),
    );
  } catch {
    // Deliberately opaque: the SES error may echo the recipient address.
    throw new Error("email_send_failed");
  }
  return { sent: true };
}
