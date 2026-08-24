---
name: founder-form-changes
description: Guard any change to a PII-collecting form in the Centre Soutien Next.js repo — the Founder Program application form and the download lead-capture form. Use this skill any time a form component, its Zod schema, its server action, its storage destination, its email notification, or the privacy policy is touched. Trigger on phrases like "update the founder form", "add a field", "change the submission endpoint", "log the submission", "email notification", "store the data", "download form", or when reviewing any diff touching `components/sections/founder-program`, `components/download/download-lead-form.tsx`, `components/download/submit-download-lead.ts`, or `app/[locale]/confidentialite`. Moroccan loi 09-08 applies — treat this as a compliance-critical path.
---

# Founder Form Changes Skill

The Founder Program form is the only place in this repo that collects personally identifiable information from users. Any change to this path has legal exposure under **loi 09-08** (Moroccan data protection law) and reputational exposure with the target audience (school directors trusting a new product with their business data).

Do not treat this as a normal form. Every change goes through this skill.

---

## The second PII path: the download lead form (SOU-312)

Since SOU-312 the repo has **two** PII-collecting forms, not one. The download
lead form (`components/download/download-lead-form.tsx` + its server action
`components/download/submit-download-lead.ts`) collects **full name + email**
to gate the app download. It reuses the exact same pipeline as the Founder form
(shared `hashIp`, `checkRateLimit`, Resend relay) and therefore **every rule in
this skill applies to it unchanged**: same honeypot, same consent checkbox, same
never-log-PII list, same privacy-policy sync. When you touch either form, follow
this skill. A new PII-collecting form in this repo must also be registered here.

---

## What counts as PII in this form

The Founder form collects:

- Center name (`nom_du_centre`)
- City (`ville`)
- Number of students (`nombre_eleves`)
- Contact email
- Contact phone

**All five fields are PII** when combined. Do not log them, do not put them in URL query strings, do not send them to analytics, do not include them in error messages or Sentry breadcrumbs.

---

## Step 1 — Identify what the change touches

Answer these questions before writing code:

- Is this a UI change only (labels, layout, ordering)? → Steps 2, 3, 9.
- Is this a schema change (adding, removing, renaming a field)? → All steps.
- Is this a submission-flow change (endpoint, storage, email)? → Steps 4–9.
- Is this a privacy-policy or consent change? → Steps 5, 8, 9.

If you're not sure which category the change falls into, treat it as a schema + submission change (the strictest path).

---

## Step 2 — UI changes

For any UI change:

- [ ] Every visible label, placeholder, and helper text goes through `next-intl` (both FR and AR).
- [ ] Every required field is marked with `aria-required="true"`.
- [ ] Every error message references the field via `aria-describedby`.
- [ ] Focus order matches visual order.
- [ ] Submit button is disabled during submission, not after (unless success — then it stays disabled).
- [ ] Loading and error states are announced to screen readers (`aria-live="polite"`).

Run the `rtl-check` skill afterward.

---

## Step 3 — Consent must be explicit

The form must include a **checkbox** the user actively ticks before submission, with adjacent text that:

- Names what data is collected (center name, city, student count, email, phone).
- Names the purpose (Founder Program application, contact by the Centre Soutien team).
- Links to the full privacy policy (`/confidentialite`).
- Names the retention duration (e.g., "conservées pendant 24 mois maximum").
- Mentions the right to access, rectify, and delete (loi 09-08, article 8).

Example text (French):
```
□ J'accepte que Centre Soutien collecte les informations ci-dessus dans le cadre
  du Programme Fondateur. Ces données sont conservées 24 mois maximum et ne
  seront jamais transmises à des tiers. Consulter la politique de confidentialité.
  (Article 8 de la loi 09-08 — droit d'accès, de rectification et de suppression.)
```

**Do not** pre-check the box. **Do not** use dark patterns to nudge consent. The submit button is disabled until the box is ticked.

---

## Step 4 — Schema changes (client + server)

The Zod schema in `lib/validators.ts` is the single source of truth for both client-side validation and server-side validation. When you change a field:

- [ ] Update the Zod schema.
- [ ] Update the TypeScript type inferred from it (`z.infer<typeof founderFormSchema>`).
- [ ] Update the form component to render the new field (or drop the removed one).
- [ ] Update the API route to handle the new shape.
- [ ] Update the storage layer (DB migration if applicable).
- [ ] Update the email notification template.
- [ ] Update the `/confidentialite` privacy policy to reflect the new data collected.
- [ ] Update the consent checkbox text if the data collected changed.

If any of the above is missed, the form is either broken or non-compliant.

---

## Step 5 — Server-side validation is mandatory

The API route re-validates every submission with the same Zod schema. Never trust the client. Example:

```tsx
// app/api/founder/route.ts
import { NextResponse } from 'next/server';
import { founderFormSchema } from '@/lib/validators';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = founderFormSchema.safeParse(body);
  if (!parsed.success) {
    // DO NOT log parsed.error.issues verbatim if they might contain user input
    return NextResponse.json({ error: 'validation_failed' }, { status: 400 });
  }

  // ... proceed with parsed.data
}
```

- [ ] Validate before doing anything else with the body.
- [ ] Return generic error codes to the client (`validation_failed`, `rate_limited`, `server_error`). Do not echo user input.
- [ ] Rate limit the endpoint (e.g., 5 requests per IP per hour). Founder applications are one-shot per center.
- [ ] Reject requests without the consent flag set to `true` in the payload.

---

## Step 6 — Storage and transmission

Wherever submissions are stored:

- [ ] The database column names match the schema field names.
- [ ] Access to the storage requires authentication (Vercel Postgres role, Supabase RLS, etc.).
- [ ] Submissions include `submitted_at`, `ip_hash` (SHA-256 of IP + salt), `user_agent`. Never store the raw IP.
- [ ] Data at rest is encrypted (Vercel Postgres and Supabase both do this by default — verify the target).
- [ ] Data in transit uses HTTPS only. The API route rejects non-HTTPS requests in production.

Email notifications to the team:

- [ ] Sent through a transactional email service (Resend, Postmark). Not through a hobby SMTP.
- [ ] The email includes the submission data but nothing extra. No "here's a debug dump".
- [ ] The recipient list is a distribution address (`founder-applications@centresoutien.com`), not a personal one.

---

## Step 7 — What NEVER to log

The following must not appear in any log, console output, analytics event, error report, or debug output:

- Email addresses
- Phone numbers
- Center names
- City names combined with center names
- Full request bodies from the Founder API route
- Zod validation errors that echo user input (`.error.issues` may include the invalid value — sanitize)
- IP addresses (log a hashed version if needed)

Approved to log:

- Timestamps
- HTTP status codes returned
- Generic outcome (`success`, `validation_failed`, `rate_limited`)
- Hashed IP (for rate limiting)

Grep the diff before merging:

```bash
git diff origin/main -- app/api/founder/ components/sections/founder-program/ \
  | grep -iE 'console\.(log|info|debug|warn|error)|logger\.|Sentry\.'
```

Any match must be reviewed — most should be removed.

---

## Step 8 — Privacy policy sync

If the schema changed, the `/confidentialite` page must reflect it — in both French and Arabic. The page lists:

- What data is collected (field by field).
- Why it is collected (purpose per field).
- How long it is retained.
- Who has access (roles, third parties if any).
- User rights under loi 09-08 (access, rectification, deletion, opposition).
- Contact for exercising those rights (email address).
- Date of last update.

The last-updated date **must** change whenever the page changes. This is legally significant, not cosmetic.

---

## Step 9 — Verification

Before merging any Founder-form change:

- [ ] `pnpm typecheck` passes (schema types propagate correctly).
- [ ] `pnpm test` passes — the Founder form has unit tests for the schema and E2E tests for the happy path.
- [ ] Submit a test application through the dev server. Verify:
  - The email arrives at the distribution address.
  - The submission is stored in the DB (or wherever storage lives).
  - No PII appears in any log (`pnpm dev` output, Vercel logs).
  - Validation errors surface as generic messages, not raw Zod output.
- [ ] Submit a malformed application (missing required field, invalid email). Verify:
  - The client-side validation catches it first.
  - The server-side validation catches it if the client is bypassed (simulate with `curl`).
  - The response is a generic `validation_failed`, not a stack trace.
- [ ] Toggle the consent checkbox off. Verify the submit button is disabled.
- [ ] Submit with `Accept-Language: ar` and verify the confirmation page renders in Arabic with RTL layout.
- [ ] Verify the privacy policy `/confidentialite` was updated if the schema changed.
- [ ] Verify the last-updated date on the privacy policy reflects today.

---

## When adding a completely new field

Ask: is this field really necessary for the Founder Program?

Data minimization is the rule: collect what you need, no more. Adding a field creates:
- More PII to secure.
- More text to translate in the privacy policy.
- More risk if the storage is ever breached.
- More friction on the form (lowering conversion).

The bar for adding a field is high. Justify it in the PR description before writing code.

---

## When removing a field

- [ ] Update the schema, form, API, storage, email template, privacy policy.
- [ ] Migrate existing data if the field will be dropped from storage. If keeping historical data, document why in the privacy policy.
- [ ] Update tests.

---

## Loi 09-08 quick reference (Moroccan data protection)

- **Consent** must be explicit, informed, and specific (article 4).
- **Right of access** — users can request what data is held (article 7).
- **Right of rectification** — users can correct their data (article 8).
- **Right of opposition** — users can object to processing (article 9).
- **Right of deletion** — users can request deletion after purpose is fulfilled.
- **Data transfer outside Morocco** requires additional safeguards (article 43). Vercel and Supabase generally store in the EU or US — the privacy policy must disclose this.
- **CNDP registration** — for commercial processing of PII, the operator must register with the Commission Nationale de contrôle de la protection des Données à caractère Personnel. Verify status before public launch.

If the change affects any of these rights or obligations, add a note to the PR description flagging it for legal review before merge.

---

## What this skill guarantees

Following the procedure prevents:

- PII leaking into logs or analytics.
- Non-compliant consent flows.
- Client-side-only validation bypassed by a hostile client.
- Silent schema drift between client, server, and storage.
- Privacy policy going stale relative to the actual data collected.
- Loi 09-08 violations that could result in fines or a takedown.

This is the highest-risk file path in the repo. Treat every change with more care than seems necessary.
