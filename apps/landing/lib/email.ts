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
