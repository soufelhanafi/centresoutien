import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { Resend } from "resend";
import type { FounderApplication } from "@/lib/validators";
import type { ResetLocale } from "@/lib/auth-reset";
import { isEmailSuppressed } from "@/lib/suppression-store";

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

// Bilingual FR/AR reset copy (SOU-273). The desktop sends the owner's UI locale
// so the code arrives in the language they are reading; an unknown/absent locale
// resolves to French upstream (resetLocaleSchema default).
const PASSWORD_RESET_SUBJECT: Record<ResetLocale, string> = {
  fr: "Code de réinitialisation — Centre Soutien",
  ar: "رمز إعادة تعيين كلمة المرور — Centre Soutien",
};

function passwordResetBodyFr(code: string): string {
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

function passwordResetBodyAr(code: string): string {
  return [
    "مرحباً،",
    "",
    "لقد طلبت إعادة تعيين كلمة المرور الخاصة بحسابك في Centre Soutien.",
    `رمز التحقق الخاص بك هو: ${code}`,
    "",
    "تنتهي صلاحية هذا الرمز خلال 20 دقيقة ولا يمكن استخدامه إلا مرة واحدة.",
    "إذا لم تكن أنت من قدّم هذا الطلب، فتجاهل هذه الرسالة.",
    "",
    "فريق Centre Soutien",
  ].join("\n");
}

function passwordResetBody(code: string, locale: ResetLocale): string {
  return locale === "ar" ? passwordResetBodyAr(code) : passwordResetBodyFr(code);
}

type SesConfig = {
  region: string;
  from: string;
  accessKeyId: string;
  secretAccessKey: string;
};

// Resolves SES credentials from the environment. Returns null when unconfigured
// so the caller can skip sending in dev; throws in production where a missing
// config is a deployment fault, not a testable no-op.
function resolveSesConfig(): SesConfig | null {
  const region = process.env.SES_REGION;
  const from = process.env.SES_FROM;
  const accessKeyId = process.env.SES_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SES_SECRET_ACCESS_KEY;
  if (!region || !from || !accessKeyId || !secretAccessKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("email_not_configured");
    }
    console.info("[reset] SES not configured — email skipped (dev)");
    return null;
  }
  return { region, from, accessKeyId, secretAccessKey };
}

function passwordResetCommand(
  config: SesConfig,
  to: string,
  code: string,
  locale: ResetLocale,
): SendEmailCommand {
  return new SendEmailCommand({
    Source: config.from,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: PASSWORD_RESET_SUBJECT[locale], Charset: "UTF-8" },
      Body: { Text: { Data: passwordResetBody(code, locale), Charset: "UTF-8" } },
    },
  });
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
  locale: ResetLocale;
}): Promise<{ sent: boolean }> {
  // A suppressed recipient (prior hard bounce / complaint, SOU-274) is a silent
  // no-op: no send, and the same generic `{ sent: false }` the caller already
  // gets when SES is unconfigured — so the outcome never signals to a caller (or,
  // upstream, an enumerating attacker) that this particular address is suppressed.
  if (await isEmailSuppressed(params.to)) return { sent: false };

  const config = resolveSesConfig();
  if (config === null) return { sent: false };

  const client = new SESClient({
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });

  try {
    await client.send(passwordResetCommand(config, params.to, params.code, params.locale));
  } catch {
    // Deliberately opaque: the SES error may echo the recipient address.
    throw new Error("email_send_failed");
  }
  return { sent: true };
}
