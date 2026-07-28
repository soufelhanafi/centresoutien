# Programme Fondateur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Programme Fondateur landing section with a loi 09-08-compliant application form that emails the team via Resend (no database), plus a bilingual `/confidentialite` privacy page.

**Architecture:** A Server Component section composes a Client Component form island. The form posts to a React 19 Server Action that validates with a shared Zod schema, drops honeypot spam, best-effort throttles per hashed IP, and sends a Resend email. No persistence — the email is the record. A minimal bilingual privacy page backs the consent link.

**Tech Stack:** Next.js 16 (App Router), React 19 Server Actions, TypeScript strict, Tailwind v4, next-intl v4, Zod, Resend, Sonner.

## Global Constraints

- **No unit/e2e tests** (CLAUDE.md §11). Each task's verification = `pnpm lint` (0 warnings) + `pnpm typecheck` (0 errors) + `pnpm build` + runtime smoke where relevant.
- **Package manager: pnpm only.** Never npm/yarn.
- **Server Components by default**; only `founder-form.tsx` and `sonner.tsx` are `"use client"`.
- **All user-facing strings via next-intl.** FR (`i18n/messages/fr.json`) is source of truth; AR mirrors the identical key structure. Parity check: `diff <(jq -r 'paths(scalars)|join(".")' i18n/messages/fr.json|sort) <(jq -r 'paths(scalars)|join(".")' i18n/messages/ar.json|sort)` must be empty.
- **Logical Tailwind props only** (`ps/pe/ms/me/text-start/text-end/border-s/e/rounded-s/e/gap`). Never `pl/pr/ml/mr/text-left/text-right/left-/right-/space-x-`. Wrap numeric/phone/currency in `<span dir="ltr">`.
- **PII rule:** never log/echo submitted values, emails, phones, center names, or raw IPs. Log only hashed IP, timestamps, generic outcome codes.
- **Commit style:** subject line only — `git commit -m "type: subject"`. No body, no trailers.
- **Branch:** `feat/programme-fondateur` (already created).
- Section anchor id is `programme-fondateur` (matches shipped header/footer anchors).

---

### Task 1: Dependencies, env template, and the shared Zod schema

**Files:**
- Modify: `package.json` (deps via pnpm)
- Create: `.env.example`
- Create: `lib/validators.ts`

**Interfaces:**
- Produces: `founderApplicationSchema` (Zod object), `type FounderApplication`, `STUDENT_RANGES` (readonly tuple), `type StudentRange`.

- [ ] **Step 1: Install dependencies**

Run:
```bash
pnpm add zod resend sonner
```
Expected: `zod`, `resend`, `sonner` appear under dependencies in `package.json`.

- [ ] **Step 2: Create `.env.example`**

```bash
# Resend transactional email (Programme Fondateur notifications)
RESEND_API_KEY=
# Recipient distribution address for founder applications
FOUNDER_NOTIFICATION_EMAIL=founder-applications@centresoutien.com
# Verified Resend sending address
RESEND_FROM_EMAIL="Centre Soutien <noreply@centresoutien.com>"
# Salt for hashing IPs before they touch any output (rate limiting only)
IP_HASH_SALT=
```

- [ ] **Step 3: Create the schema** `lib/validators.ts`

```ts
import { z } from "zod";

/** Student-count buckets shown in the founder form. */
export const STUDENT_RANGES = ["lt50", "50-150", "150-300", "gt300"] as const;
export type StudentRange = (typeof STUDENT_RANGES)[number];

// Moroccan phone: +212 or leading 0, then digits/spaces/dashes (>= 9 more chars).
const MOROCCAN_PHONE = /^(?:\+212|0)[\d\s-]{9,}$/;

/** Single source of truth for the founder application, used client + server. */
export const founderApplicationSchema = z.object({
  centerName: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(80),
  studentsRange: z.enum(STUDENT_RANGES),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().regex(MOROCCAN_PHONE),
  consent: z.literal(true),
});

export type FounderApplication = z.infer<typeof founderApplicationSchema>;
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: PASS (0 errors).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example lib/validators.ts
git commit -m "feat: add founder application schema and email/env deps"
```

---

### Task 2: UI primitives (Input, Label, Checkbox) and Sonner toaster

**Files:**
- Create: `components/ui/label.tsx`, `components/ui/input.tsx`, `components/ui/checkbox.tsx`, `components/ui/sonner.tsx`
- Modify: `app/[locale]/layout.tsx` (mount `<Toaster />`)

**Interfaces:**
- Produces: `Label`, `Input`, `Checkbox` (forwardRef components), `Toaster` (client).
- Consumes: `cn` from `@/lib/utils`.

- [ ] **Step 1: `components/ui/label.tsx`**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label ref={ref} className={cn("block text-sm font-medium", className)} {...props} />
));
Label.displayName = "Label";

export { Label };
```

- [ ] **Step 2: `components/ui/input.tsx`**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
```

- [ ] **Step 3: `components/ui/checkbox.tsx`** (native, no extra dep)

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      "size-4 shrink-0 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
```

- [ ] **Step 4: `components/ui/sonner.tsx`**

```tsx
"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return <SonnerToaster position="top-center" richColors closeButton />;
}
```

- [ ] **Step 5: Mount the toaster** — in `app/[locale]/layout.tsx`, add the import and render `<Toaster />` as the last child of `<body>`.

Add import near the other component imports:
```tsx
import { Toaster } from "@/components/ui/sonner";
```
Change the body content from:
```tsx
      <body className="min-h-full bg-background text-foreground">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
```
to:
```tsx
      <body className="min-h-full bg-background text-foreground">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Toaster />
      </body>
```

- [ ] **Step 6: Verify**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/ui/label.tsx components/ui/input.tsx components/ui/checkbox.tsx components/ui/sonner.tsx "app/[locale]/layout.tsx"
git commit -m "feat: add input/label/checkbox primitives and sonner toaster"
```

---

### Task 3: Email helper and the Server Action

**Files:**
- Create: `lib/email.ts`
- Create: `components/sections/founder-program/submit-application.ts`

**Interfaces:**
- Consumes: `founderApplicationSchema`, `FounderApplication` (Task 1).
- Produces: `sendFounderNotification(data, meta) => Promise<{ sent: boolean }>`; `submitFounderApplication(prev, formData) => Promise<FounderFormState>`; `type FounderFormState`.

- [ ] **Step 1: `lib/email.ts`**

```ts
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

/**
 * Sends the team notification. Returns { sent: false } in development when
 * Resend is not configured (so the flow stays testable) and throws in
 * production. Never logs PII.
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

  await resend.emails.send({
    from,
    to,
    replyTo: data.email,
    subject: `Candidature Programme Fondateur — ${data.centerName}`,
    text,
  });
  return { sent: true };
}
```

- [ ] **Step 2: `components/sections/founder-program/submit-application.ts`**

```ts
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
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/email.ts components/sections/founder-program/submit-application.ts
git commit -m "feat: add founder email helper and submission server action"
```

---

### Task 4: Founder section, form island, messages, and page wiring

**Files:**
- Create: `components/sections/founder-program/founder-form.tsx`, `components/sections/founder-program/founder-program.tsx`, `components/sections/founder-program/index.ts`
- Modify: `i18n/messages/fr.json`, `i18n/messages/ar.json` (add `founder` namespace)
- Modify: `app/[locale]/page.tsx` (render `<FounderProgram />` after `<Pricing />`, before `<Testimonials />`)

**Interfaces:**
- Consumes: `submitFounderApplication`, `FounderFormState` (Task 3); `STUDENT_RANGES` (Task 1); `Input`/`Label`/`Checkbox` (Task 2); `Button`, `cn`, `Link`.
- Produces: `FounderProgram` (async Server Component).

- [ ] **Step 1: Add the `founder` namespace to `i18n/messages/fr.json`** (merge this object at the top level):

```json
"founder": {
  "badge": "★ Inscriptions ouvertes · 20 places",
  "heading": "Programme Fondateur",
  "body": "Vingt centres partenaires soigneusement sélectionnés bénéficient d'un accompagnement privilégié d'un an — sessions de travail directes avec l'équipe produit, formation approfondie, et influence directe sur la feuille de route — en échange de leurs retours honnêtes et détaillés.",
  "note": "Places limitées. Sélection sur dossier. Réponse sous 5 jours ouvrés.",
  "stats": {
    "places": { "value": "20", "label": "places disponibles" },
    "duration": { "value": "12 mois", "label": "d'accompagnement" },
    "one_on_one": { "value": "1:1", "label": "avec le fondateur" }
  },
  "form": {
    "title": "Postuler au programme",
    "subtitle": "Toutes les candidatures sont lues personnellement.",
    "fields": {
      "center": { "label": "Nom du centre", "placeholder": "Centre Al Massar" },
      "city": { "label": "Ville", "placeholder": "Casablanca" },
      "students": {
        "label": "Élèves actuels",
        "placeholder": "Choisir…",
        "options": {
          "lt50": "Moins de 50",
          "50-150": "50 à 150",
          "150-300": "150 à 300",
          "gt300": "Plus de 300"
        }
      },
      "email": { "label": "Email", "placeholder": "karim@almassar.ma" },
      "phone": { "label": "Téléphone" }
    },
    "consent": "J'accepte que Centre Soutien collecte ces informations dans le cadre du Programme Fondateur. Données conservées 24 mois maximum, jamais transmises à des tiers. <link>Politique de confidentialité</link> — droits d'accès, de rectification et de suppression (loi 09-08).",
    "submit": "Postuler",
    "submitting": "Envoi…",
    "success_title": "Candidature reçue 🎉",
    "success_body": "Merci. Nous revenons vers vous sous 5 jours ouvrés.",
    "toast_success": "Votre candidature a bien été envoyée.",
    "toast_validation": "Veuillez corriger les champs en rouge.",
    "toast_error": "Une erreur est survenue. Réessayez dans un instant.",
    "errors": {
      "centerName": "Indiquez le nom du centre (2 caractères min).",
      "city": "Indiquez la ville.",
      "studentsRange": "Choisissez une tranche d'élèves.",
      "email": "Indiquez une adresse email valide.",
      "phone": "Indiquez un numéro marocain valide.",
      "consent": "Vous devez accepter la politique de confidentialité."
    }
  }
}
```

- [ ] **Step 2: Add the mirrored `founder` namespace to `i18n/messages/ar.json`** (identical keys, MSA):

```json
"founder": {
  "badge": "★ التسجيل مفتوح · 20 مقعدًا",
  "heading": "برنامج المؤسِّسين",
  "body": "عشرون مركزًا شريكًا مختارًا بعناية يستفيدون من مواكبة مميّزة لمدة سنة — جلسات عمل مباشرة مع فريق المنتج، وتكوين معمّق، وتأثير مباشر في خارطة الطريق — مقابل ملاحظاتهم الصادقة والمفصّلة.",
  "note": "المقاعد محدودة. الاختيار عبر ملف. الرد خلال 5 أيام عمل.",
  "stats": {
    "places": { "value": "20", "label": "مقعدًا متاحًا" },
    "duration": { "value": "12 شهرًا", "label": "من المواكبة" },
    "one_on_one": { "value": "1:1", "label": "مع المؤسِّس" }
  },
  "form": {
    "title": "الترشّح للبرنامج",
    "subtitle": "تُقرأ جميع الترشيحات شخصيًا.",
    "fields": {
      "center": { "label": "اسم المركز", "placeholder": "مركز المسار" },
      "city": { "label": "المدينة", "placeholder": "الدار البيضاء" },
      "students": {
        "label": "عدد التلاميذ الحالي",
        "placeholder": "اختر…",
        "options": {
          "lt50": "أقل من 50",
          "50-150": "من 50 إلى 150",
          "150-300": "من 150 إلى 300",
          "gt300": "أكثر من 300"
        }
      },
      "email": { "label": "البريد الإلكتروني", "placeholder": "karim@almassar.ma" },
      "phone": { "label": "الهاتف" }
    },
    "consent": "أوافق على أن يجمع Centre Soutien هذه المعلومات في إطار برنامج المؤسِّسين. تُحفظ البيانات 24 شهرًا كحد أقصى، ولا تُنقل إلى أطراف ثالثة. <link>سياسة الخصوصية</link> — حقوق الوصول والتصحيح والحذف (القانون 09-08).",
    "submit": "الترشّح",
    "submitting": "جارٍ الإرسال…",
    "success_title": "تم استلام ترشيحك 🎉",
    "success_body": "شكرًا لك. سنعود إليك خلال 5 أيام عمل.",
    "toast_success": "تم إرسال ترشيحك بنجاح.",
    "toast_validation": "يرجى تصحيح الحقول باللون الأحمر.",
    "toast_error": "حدث خطأ. أعد المحاولة بعد لحظات.",
    "errors": {
      "centerName": "أدخل اسم المركز (حرفان على الأقل).",
      "city": "أدخل المدينة.",
      "studentsRange": "اختر تِبعًا لعدد التلاميذ.",
      "email": "أدخل بريدًا إلكترونيًا صالحًا.",
      "phone": "أدخل رقمًا مغربيًا صالحًا.",
      "consent": "يجب أن توافق على سياسة الخصوصية."
    }
  }
}
```

- [ ] **Step 3: Verify parity**

Run:
```bash
diff <(jq -r 'paths(scalars)|join(".")' i18n/messages/fr.json|sort) <(jq -r 'paths(scalars)|join(".")' i18n/messages/ar.json|sort)
```
Expected: empty output.

- [ ] **Step 4: `components/sections/founder-program/founder-form.tsx`**

```tsx
"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { STUDENT_RANGES } from "@/lib/validators";
import {
  submitFounderApplication,
  type FounderFormState,
} from "./submit-application";

const initialState: FounderFormState = { status: "idle" };
const fieldClass =
  "border-white/15 bg-slate-950/40 text-white placeholder:text-slate-500 focus-visible:ring-offset-slate-900";

export function FounderForm() {
  const t = useTranslations("founder.form");
  const [state, formAction, pending] = useActionState(
    submitFounderApplication,
    initialState,
  );
  const [consent, setConsent] = useState(false);
  const seen = useRef<FounderFormState>(initialState);
  const id = {
    center: useId(),
    city: useId(),
    students: useId(),
    email: useId(),
    phone: useId(),
    consent: useId(),
  };

  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state.status === "success") toast.success(t("toast_success"));
    else if (state.status === "error") {
      toast.error(
        state.error === "validation_failed"
          ? t("toast_validation")
          : t("toast_error"),
      );
    }
  }, [state, t]);

  if (state.status === "success") {
    return (
      <div
        aria-live="polite"
        className="rounded-2xl border border-white/10 bg-white/5 p-7 text-center"
      >
        <p className="text-lg font-bold text-white">{t("success_title")}</p>
        <p className="mt-2 text-sm text-slate-300">{t("success_body")}</p>
      </div>
    );
  }

  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const err = (name: string) => (errors[name] ? t(`errors.${name}`) : undefined);

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-white/10 bg-white/5 p-7"
    >
      <p className="text-lg font-bold text-white">{t("title")}</p>
      <p className="mb-5 mt-1 text-[13px] text-slate-400">{t("subtitle")}</p>

      {/* Honeypot — visually hidden, off the a11y tree. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="pointer-events-none absolute -z-10 size-0 opacity-0"
      />

      <div className="flex flex-col gap-3.5">
        <Field id={id.center} label={t("fields.center.label")} error={err("centerName")}>
          <Input
            id={id.center}
            name="centerName"
            required
            aria-required="true"
            aria-invalid={Boolean(err("centerName"))}
            aria-describedby={err("centerName") ? `${id.center}-err` : undefined}
            placeholder={t("fields.center.placeholder")}
            className={fieldClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field id={id.city} label={t("fields.city.label")} error={err("city")}>
            <Input
              id={id.city}
              name="city"
              required
              aria-required="true"
              aria-invalid={Boolean(err("city"))}
              aria-describedby={err("city") ? `${id.city}-err` : undefined}
              placeholder={t("fields.city.placeholder")}
              className={fieldClass}
            />
          </Field>
          <Field
            id={id.students}
            label={t("fields.students.label")}
            error={err("studentsRange")}
          >
            <select
              id={id.students}
              name="studentsRange"
              required
              defaultValue=""
              aria-required="true"
              aria-invalid={Boolean(err("studentsRange"))}
              aria-describedby={err("studentsRange") ? `${id.students}-err` : undefined}
              className={cn(
                "flex h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                fieldClass,
              )}
            >
              <option value="" disabled>
                {t("fields.students.placeholder")}
              </option>
              {STUDENT_RANGES.map((r) => (
                <option key={r} value={r} className="text-slate-900">
                  {t(`fields.students.options.${r}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field id={id.email} label={t("fields.email.label")} error={err("email")}>
          <Input
            id={id.email}
            type="email"
            name="email"
            required
            aria-required="true"
            aria-invalid={Boolean(err("email"))}
            aria-describedby={err("email") ? `${id.email}-err` : undefined}
            placeholder={t("fields.email.placeholder")}
            className={fieldClass}
          />
        </Field>

        <Field id={id.phone} label={t("fields.phone.label")} error={err("phone")}>
          <Input
            id={id.phone}
            type="tel"
            name="phone"
            required
            dir="ltr"
            aria-required="true"
            aria-invalid={Boolean(err("phone"))}
            aria-describedby={err("phone") ? `${id.phone}-err` : undefined}
            placeholder="+212 6 12 34 56 78"
            className={fieldClass}
          />
        </Field>

        <div className="mt-1 flex gap-2.5">
          <Checkbox
            id={id.consent}
            name="consent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-required="true"
            aria-describedby={err("consent") ? `${id.consent}-err` : undefined}
            className="mt-0.5"
          />
          <Label
            htmlFor={id.consent}
            className="text-[12.5px] font-normal leading-relaxed text-slate-300"
          >
            {t.rich("consent", {
              link: (chunks) => (
                <Link href="/confidentialite" className="text-teal-300 underline">
                  {chunks}
                </Link>
              ),
            })}
          </Label>
        </div>
        {err("consent") ? (
          <p id={`${id.consent}-err`} className="text-xs text-red-300">
            {err("consent")}
          </p>
        ) : null}

        <Button type="submit" disabled={!consent || pending} className="mt-2">
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 text-xs text-slate-300">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-xs text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: `components/sections/founder-program/founder-program.tsx`**

```tsx
import { getTranslations } from "next-intl/server";
import { FounderForm } from "./founder-form";

const STATS = ["places", "duration", "one_on_one"] as const;

export async function FounderProgram() {
  const t = await getTranslations("founder");

  return (
    <section
      id="programme-fondateur"
      aria-labelledby="founder-heading"
      className="bg-gradient-to-b from-slate-900 to-teal-950 px-8 py-24 text-white"
    >
      <div className="mx-auto grid max-w-[1100px] items-start gap-16 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-300/25 bg-teal-300/10 px-3 py-1.5 text-[12.5px] font-semibold text-teal-300">
            {t("badge")}
          </span>
          <h2
            id="founder-heading"
            className="mt-5 text-4xl font-extrabold tracking-tight sm:text-[42px]"
          >
            {t("heading")}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-300">{t("body")}</p>
          <p className="mt-4 text-[15px] text-slate-400">{t("note")}</p>
          <dl className="mt-7 grid grid-cols-3 gap-4">
            {STATS.map((k) => (
              <div key={k}>
                <dt className="text-[26px] font-extrabold text-teal-300">
                  <span dir="ltr">{t(`stats.${k}.value`)}</span>
                </dt>
                <dd className="text-[12.5px] text-slate-400">
                  {t(`stats.${k}.label`)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <FounderForm />
      </div>
    </section>
  );
}
```

- [ ] **Step 6: `components/sections/founder-program/index.ts`**

```ts
export { FounderProgram } from "./founder-program";
```

- [ ] **Step 7: Wire into `app/[locale]/page.tsx`** — add the import with the other section imports:
```tsx
import { FounderProgram } from "@/components/sections/founder-program";
```
and render it inside `<main>` between `<Pricing />` and `<Testimonials />`:
```tsx
        <Pricing />
        <FounderProgram />
        <Testimonials />
```

- [ ] **Step 8: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS; `/fr` and `/ar` prerender static.

Then smoke:
```bash
pnpm start -p 3130 & sleep 4
curl -s http://localhost:3130/fr | grep -oE 'id="programme-fondateur"'      # -> match
curl -s http://localhost:3130/ar | grep -oE 'برنامج المؤسِّسين'             # -> match
pkill -f "next start"
```
Expected: both greps match.

- [ ] **Step 9: Commit**

```bash
git add components/sections/founder-program i18n/messages/fr.json i18n/messages/ar.json "app/[locale]/page.tsx"
git commit -m "feat: add Programme Fondateur section and application form"
```

---

### Task 5: Privacy page `/confidentialite` + SEO wiring

**Files:**
- Create: `app/[locale]/confidentialite/page.tsx`
- Modify: `lib/structured-data.ts` (add `getBreadcrumbSchema`)
- Modify: `i18n/messages/fr.json`, `i18n/messages/ar.json` (add `confidentialite` namespace)
- Modify: `app/sitemap.ts` (add `/confidentialite` per locale)
- Modify: `components/sections/footer/footer.tsx` (privacy link → `/confidentialite`)

**Interfaces:**
- Consumes: `JsonLd`, `SITE_URL`, `Locale`.
- Produces: `getBreadcrumbSchema(locale, items) => object`.

- [ ] **Step 1: Add `getBreadcrumbSchema` to `lib/structured-data.ts`** (append):

```ts
type BreadcrumbSchema = {
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: Array<{
    "@type": "ListItem";
    position: number;
    name: string;
    item: string;
  }>;
};

/** Breadcrumb trail for interior pages. `items` are ordered [root, …, current]. */
export function getBreadcrumbSchema(
  locale: Locale,
  items: ReadonlyArray<{ name: string; path: string }>,
): BreadcrumbSchema {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: `${SITE_URL}/${locale}${entry.path}`,
    })),
  };
}
```

- [ ] **Step 2: Add `confidentialite` namespace to `i18n/messages/fr.json`** (merge at top level):

```json
"confidentialite": {
  "meta_title": "Politique de confidentialité — Centre Soutien",
  "meta_description": "Ce que Centre Soutien collecte via le Programme Fondateur, la durée de conservation et vos droits au titre de la loi 09-08.",
  "breadcrumb": "Confidentialité",
  "heading": "Politique de confidentialité",
  "updated": "Dernière mise à jour : 28 juillet 2026",
  "intro": "Cette page décrit les données personnelles que Centre Soutien collecte via le formulaire du Programme Fondateur, pourquoi elles sont collectées, combien de temps elles sont conservées et les droits dont vous disposez au titre de la loi 09-08.",
  "sections": {
    "collected": {
      "title": "Données collectées",
      "body": "Le formulaire du Programme Fondateur collecte : le nom du centre, la ville, une tranche indicative du nombre d'élèves, une adresse email et un numéro de téléphone. Aucune autre donnée n'est collectée sur ce site."
    },
    "purpose": {
      "title": "Finalité",
      "body": "Ces informations servent uniquement à étudier votre candidature au Programme Fondateur et à vous recontacter. Elles ne sont jamais transmises à des tiers ni utilisées à des fins publicitaires."
    },
    "retention": {
      "title": "Durée de conservation",
      "body": "Les candidatures sont conservées 24 mois maximum, puis supprimées."
    },
    "access": {
      "title": "Accès",
      "body": "Les candidatures sont reçues par email par l'équipe de Centre Soutien. L'acheminement de l'email est assuré par notre prestataire technique Resend."
    },
    "rights": {
      "title": "Vos droits (loi 09-08)",
      "body": "Vous disposez d'un droit d'accès, de rectification, d'opposition et de suppression de vos données. Pour l'exercer, écrivez-nous à privacy@centresoutien.com."
    }
  }
}
```

- [ ] **Step 3: Add the mirrored `confidentialite` namespace to `i18n/messages/ar.json`:**

```json
"confidentialite": {
  "meta_title": "سياسة الخصوصية — Centre Soutien",
  "meta_description": "ما يجمعه Centre Soutien عبر برنامج المؤسِّسين، ومدة الحفظ، وحقوقك بموجب القانون 09-08.",
  "breadcrumb": "الخصوصية",
  "heading": "سياسة الخصوصية",
  "updated": "آخر تحديث: 28 يوليوز 2026",
  "intro": "توضّح هذه الصفحة البيانات الشخصية التي يجمعها Centre Soutien عبر نموذج برنامج المؤسِّسين، وسبب جمعها، ومدة حفظها، وحقوقك بموجب القانون 09-08.",
  "sections": {
    "collected": {
      "title": "البيانات المجموعة",
      "body": "يجمع نموذج برنامج المؤسِّسين: اسم المركز، والمدينة، وتِبعًا تقريبيًا لعدد التلاميذ، وبريدًا إلكترونيًا، ورقم هاتف. لا تُجمع أي بيانات أخرى على هذا الموقع."
    },
    "purpose": {
      "title": "الغاية",
      "body": "تُستعمل هذه المعلومات فقط لدراسة ترشيحك لبرنامج المؤسِّسين وللتواصل معك. لا تُنقل أبدًا إلى أطراف ثالثة ولا تُستعمل لأغراض إعلانية."
    },
    "retention": {
      "title": "مدة الحفظ",
      "body": "تُحفظ الترشيحات 24 شهرًا كحد أقصى، ثم تُحذف."
    },
    "access": {
      "title": "الوصول",
      "body": "تصل الترشيحات عبر البريد الإلكتروني إلى فريق Centre Soutien. يتولّى مزوّدنا التقني Resend إيصال البريد."
    },
    "rights": {
      "title": "حقوقك (القانون 09-08)",
      "body": "لك الحق في الوصول إلى بياناتك وتصحيحها والاعتراض عليها وحذفها. لممارسة ذلك، راسلنا على privacy@centresoutien.com."
    }
  }
}
```

- [ ] **Step 4: Verify parity**

Run:
```bash
diff <(jq -r 'paths(scalars)|join(".")' i18n/messages/fr.json|sort) <(jq -r 'paths(scalars)|join(".")' i18n/messages/ar.json|sort)
```
Expected: empty.

- [ ] **Step 5: `app/[locale]/confidentialite/page.tsx`**

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { JsonLd } from "@/components/seo/json-ld";
import { getBreadcrumbSchema, SITE_URL } from "@/lib/structured-data";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "confidentialite" });
  return {
    metadataBase: new URL(SITE_URL),
    title: t("meta_title"),
    description: t("meta_description"),
    alternates: {
      canonical: `${SITE_URL}/${locale}/confidentialite`,
      languages: {
        "fr-MA": `${SITE_URL}/fr/confidentialite`,
        "ar-MA": `${SITE_URL}/ar/confidentialite`,
        "x-default": `${SITE_URL}/fr/confidentialite`,
      },
    },
    openGraph: {
      type: "website",
      locale: locale === "ar" ? "ar_MA" : "fr_MA",
      url: `${SITE_URL}/${locale}/confidentialite`,
      siteName: "Centre Soutien",
      title: t("meta_title"),
      description: t("meta_description"),
    },
    twitter: { card: "summary_large_image", title: t("meta_title") },
  };
}

const SECTIONS = ["collected", "purpose", "retention", "access", "rights"] as const;

export default async function ConfidentialitePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations("confidentialite");

  return (
    <main className="mx-auto max-w-3xl px-8 py-24">
      <JsonLd
        id="ld-breadcrumb"
        data={getBreadcrumbSchema(locale, [
          { name: "Centre Soutien", path: "" },
          { name: t("breadcrumb"), path: "/confidentialite" },
        ])}
      />
      <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
        {t("heading")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("updated")}</p>
      <p className="mt-6 text-lg leading-relaxed text-slate-600">{t("intro")}</p>
      <div className="mt-10 flex flex-col gap-8">
        {SECTIONS.map((key) => (
          <section key={key}>
            <h2 className="text-xl font-bold text-foreground">
              {t(`sections.${key}.title`)}
            </h2>
            <p className="mt-2 leading-relaxed text-slate-600">
              {t(`sections.${key}.body`)}
            </p>
          </section>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Add `/confidentialite` to `app/sitemap.ts`** — for each locale add an entry alongside the homepage. In the map that builds entries, add a second URL per locale:
```ts
`${SITE_URL}/${locale}/confidentialite`
```
with the same `lastModified` and reciprocal `alternates.languages` mapping `fr-MA`→`/fr/confidentialite`, `ar-MA`→`/ar/confidentialite`. (Follow the existing homepage entry's shape.)

- [ ] **Step 7: Point the footer privacy link at the page** — in `components/sections/footer/footer.tsx`, import the locale-aware Link:
```tsx
import { Link } from "@/i18n/navigation";
```
Then render the `legal.privacy` link as a `<Link href="/confidentialite">` instead of `<a href="#">`. (Leave the other placeholder legal links as-is.) One clean way: special-case the `privacy` key in the legal column's link map so its `href` is `/confidentialite` and it renders via `Link`; keep the rest as `<a href="#">`.

- [ ] **Step 8: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS; route list now includes `/[locale]/confidentialite`.

Then smoke:
```bash
pnpm start -p 3131 & sleep 4
curl -sI http://localhost:3131/fr/confidentialite | head -1                 # -> 200
curl -s http://localhost:3131/fr/confidentialite | grep -oE '"@type":"BreadcrumbList"'  # -> match
curl -s http://localhost:3131/sitemap.xml | grep -c confidentialite         # -> 2
pkill -f "next start"
```
Expected: 200, BreadcrumbList present, 2 sitemap entries.

- [ ] **Step 9: Commit**

```bash
git add "app/[locale]/confidentialite" lib/structured-data.ts app/sitemap.ts components/sections/footer/footer.tsx i18n/messages/fr.json i18n/messages/ar.json
git commit -m "feat: add bilingual confidentialite page with breadcrumb schema"
```

---

### Task 6: Final full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Lint + typecheck + build**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: 0 warnings, 0 type errors, build succeeds, `/fr` + `/ar` + `/fr/confidentialite` + `/ar/confidentialite` static.

- [ ] **Step 2: i18n parity**

Run:
```bash
diff <(jq -r 'paths(scalars)|join(".")' i18n/messages/fr.json|sort) <(jq -r 'paths(scalars)|join(".")' i18n/messages/ar.json|sort)
```
Expected: empty.

- [ ] **Step 3: RTL directional-class scan**

Run:
```bash
grep -rnE '\b(pl-|pr-|ml-|mr-|text-left|text-right|space-x-)[0-9a-z]|\bborder-l-|\bborder-r-|\brounded-l-|\brounded-r-|\b(left-|right-)[0-9]' app/ components/ --include='*.tsx' | grep -v 'components/ui/'
```
Expected: no output.

- [ ] **Step 4: PII-in-logs scan of the founder path**

Run:
```bash
grep -rnE 'console\.(log|info|debug|warn|error)' components/sections/founder-program lib/email.ts lib/validators.ts
```
Expected: only the single non-PII dev notice in `lib/email.ts`. Confirm no field values are logged.

- [ ] **Step 5: Runtime smoke both locales**

```bash
pnpm start -p 3132 & sleep 4
# section + anchor
curl -s http://localhost:3132/fr | grep -oE 'id="programme-fondateur"'
# consent link resolves
curl -sI http://localhost:3132/fr/confidentialite | head -1
# AR renders
curl -s http://localhost:3132/ar | grep -oE 'برنامج المؤسِّسين'
pkill -f "next start"
```
Manual (browser, `pnpm dev`): submit with consent unchecked → button disabled; submit invalid email → inline error + error toast; submit valid → thank-you state + success toast (dev logs "email skipped"); open `/ar` → form mirrors RTL, phone example stays LTR.

- [ ] **Step 6: Final commit (if any fixes were made)**

```bash
git add -A
git commit -m "chore: verify Programme Fondateur across locales"
```

---

## Notes for the operator (not code)

- Set `RESEND_API_KEY`, `FOUNDER_NOTIFICATION_EMAIL`, `RESEND_FROM_EMAIL`, `IP_HASH_SALT` in the Vercel project env before production. Verify the sending domain in Resend.
- Rate limiting is best-effort in-memory only; add Vercel KV/Upstash for durable limiting in a follow-up.
- CNDP registration for PII processing is an operator/legal task.
