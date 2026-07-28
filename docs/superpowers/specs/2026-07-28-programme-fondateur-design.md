# Programme Fondateur — Design Spec

**Date:** 2026-07-28
**Status:** Approved (design), pending implementation plan
**Governing skill:** `founder-form-changes` (this is the only PII path in the repo; loi 09-08 applies)

---

## 1. Goal

Add the **Programme Fondateur** landing section and its application form — the site's third business goal (collecting founder applications). Applicants submit a short form; the team is notified by email. This is the only place in the repo that collects personally identifiable information (PII).

## 2. Decisions (locked)

- **Backend:** Resend email only, **no database**. The notification email is the record. (Deviation from CLAUDE.md §12, which specifies a DB — accepted for a low-volume, ~20-place program.)
- **Fields:** the design's 5 fields + a required consent checkbox. `Élèves actuels` is a **range select**, not free text.
- **Privacy page:** build a minimal bilingual `/confidentialite` now (the consent link must resolve).
- **Submission mechanism:** React 19 **Server Action** (`useActionState`), not a client fetch/API route (CLAUDE.md §10.4).
- **Form primitives:** hand-authored shadcn-style `Input`/`Label`/`Checkbox` in `components/ui/` (consistent with the existing hand-authored `Button`), plus **Sonner** for the result toast.
- **Config via env:** `RESEND_API_KEY`, `FOUNDER_NOTIFICATION_EMAIL`, `RESEND_FROM_EMAIL`.

## 3. Files

**New**
- `components/sections/founder-program/founder-program.tsx` — Server Component: eyebrow badge, heading, copy, 3 stats (20 places / 12 mois / 1:1), composes the form.
- `components/sections/founder-program/founder-form.tsx` — Client Component island (the only `"use client"` here).
- `components/sections/founder-program/submit-application.ts` — `"use server"` Server Action.
- `components/sections/founder-program/index.ts` — barrel.
- `lib/validators.ts` — `founderApplicationSchema` (Zod) + `FounderApplication` inferred type.
- `lib/email.ts` — Resend client + `sendFounderNotification(data, meta)`.
- `components/ui/input.tsx`, `components/ui/label.tsx`, `components/ui/checkbox.tsx`, `components/ui/sonner.tsx`.
- `app/[locale]/confidentialite/page.tsx` — bilingual privacy page.
- `.env.example`.

**Modified**
- `app/[locale]/layout.tsx` — mount `<Toaster />` (Sonner).
- `app/[locale]/page.tsx` — render `<FounderProgram />` after `<Pricing />`, before `<Testimonials />`.
- `i18n/messages/fr.json` + `ar.json` — add `founder.*` and `confidentialite.*` namespaces (identical key structure).
- `app/sitemap.ts` — add `/confidentialite` per locale.
- `components/sections/footer/footer.tsx` — point the Confidentialité link at `/confidentialite`.
- `package.json` — add `zod`, `resend`, `sonner`.

## 4. Schema (`founderApplicationSchema`, single source for client + server)

| Field | Rule |
|---|---|
| `centerName` | string, trimmed, 2–120 |
| `city` | string, trimmed, 2–80 |
| `studentsRange` | enum: `lt50` \| `50-150` \| `150-300` \| `gt300` |
| `email` | valid email, ≤160 |
| `phone` | Moroccan format (`+212`/`0` + 9 digits, spaces tolerated) |
| `consent` | must be `true` (literal) |
| `website` | honeypot — must be empty; non-empty ⇒ silently dropped |

## 5. Form UX (Client Component)

- Labelled inputs (never placeholder-only). Range as a native `<select>`.
- Client-side Zod validation for inline field errors; `aria-required`, `aria-describedby` per field, `aria-live="polite"` status region.
- Consent checkbox **unchecked by default**; **submit disabled until checked**. No dark patterns.
- Submit disabled during submission. On success: form swaps to a thank-you state + Sonner success toast. On error: Sonner error toast + inline errors.
- All strings via `next-intl`. The Server Action returns error **codes**; the client maps codes → localized text. Phone example wrapped in `dir="ltr"`.

## 6. Server Action flow (`"use server"`)

1. Honeypot: if `website` non-empty → return generic success (drop silently).
2. `founderApplicationSchema.safeParse(formData)`. On failure → `{ ok: false, fieldErrors }` with generic codes; **never echo submitted values**.
3. Best-effort per-IP throttle using a hashed IP from request headers (in-memory; imperfect on serverless — see §11).
4. `sendFounderNotification(data, { submittedAt, ipHash, userAgent })` → Resend email to `FOUNDER_NOTIFICATION_EMAIL`, from `RESEND_FROM_EMAIL`. Email body contains the 5 fields + metadata only.
5. Return `{ ok: true }` or `{ ok: false, error: "server_error" }`.

**No PII in any log/analytics/console.** Raw IP is never stored — only a salted SHA-256 hash. If `RESEND_API_KEY` is missing: dev ⇒ non-PII console notice + treat as success (flow testable without keys); prod ⇒ return `server_error`.

## 7. Consent & privacy (loi 09-08)

Consent label names: the data collected (center, city, student range, email, phone), the purpose (Programme Fondateur application + contact by the team), **24-month** retention, the right to access/rectify/delete (art. 8), and a link to `/confidentialite`.

`/confidentialite` (bilingual) documents: data collected (field by field), purpose per field, retention, who has access (the team distribution address; Resend as processor), user rights under loi 09-08, a contact email for exercising them, and a **last-updated date**. Full metadata (title/description/canonical/hreflang), added to `sitemap.ts`, with `BreadcrumbList` JSON-LD.

## 8. i18n & RTL

- New namespaces `founder.*` and `confidentialite.*` in both locales, identical key structure (verified by the parity check).
- Server Action returns codes, not localized text.
- Logical Tailwind props only; the dark form sits on the section's gradient; numeric/phone examples wrapped `dir="ltr"`.

## 9. SEO

- Section `id="programme-fondateur"` (resolves header + footer anchors).
- `/confidentialite`: metadata + canonical + reciprocal hreflang, in the sitemap, `BreadcrumbList` JSON-LD. No new homepage JSON-LD for the founder section.

## 10. Verification

lint · typecheck · build (both locales static) · i18n key parity · RTL directional-class scan · runtime smoke both locales: valid submit (success path with `RESEND_API_KEY` absent), invalid submit → inline errors, consent-off → submit disabled, honeypot drop. Per CLAUDE.md §11, no unit/e2e tests.

## 11. Known limitations / out of scope

- **Rate limiting** is best-effort only (no store). Robust per-IP limiting would need Vercel KV/Upstash — a follow-up.
- **No persistence** beyond the email (by decision). If applications must be queryable later, add a store in a follow-up.
- Real Resend domain verification + the actual `FOUNDER_NOTIFICATION_EMAIL` / `RESEND_FROM_EMAIL` values are supplied by the operator via env.
- CNDP registration for PII processing is an operator/legal task, noted in `/confidentialite`, not code.

## 12. Deliberate deviations from the design source of truth

- The design's form has **no consent checkbox**; we add one (skill-mandated, loi 09-08).
- `Élèves actuels` becomes a **range select** instead of free text.
- Section `id` is `programme-fondateur` (not the design's `fondateur`) to match the nav/footer anchors already shipped.
