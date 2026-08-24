# CLAUDE.md

This file guides Claude Code (claude.ai/code) when working in this repository. Read it fully before touching code.

---

## 1. Project Overview

This repo is the **public marketing landing page** for **Centre Soutien** — an offline-first desktop application (built separately with Tauri + React + SQLite) that helps Moroccan academic support centers manage rooms, teachers, students, groups, recurring weekly sessions, and monthly invoicing.

**This site's job is narrow and important:**
1. Convince a Moroccan school director (35–55 y/o, French-first, Arabic-second, low tech literacy) to download the app.
2. Rank in French and Arabic Google search for terms like "logiciel gestion centre soutien scolaire Maroc", "gestion école soutien Casablanca", etc.
3. Collect Founder Program applications.

**Design source of truth:** [Claude Design conversation](https://claude.ai/design/p/d89a37e3-5435-4e1c-8da8-71ec4079f932?file=Centre+Soutien+Landing.dc.html&via=share). Do not invent new visual elements without checking there first.

**Not in scope for this repo:** the desktop app itself, any authenticated dashboard, payment processing.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server Components by default |
| Language | TypeScript (strict) | No `any`, no `@ts-ignore` without a comment explaining why |
| Styling | Tailwind CSS v4 | Use the design tokens defined in `app/globals.css` |
| Components | shadcn/ui | Installed on demand, lives in `components/ui/` |
| Icons | lucide-react | Tree-shakeable, matches the design |
| i18n | next-intl | FR (default) + AR (RTL) |
| Fonts | next/font | Inter for Latin, Noto Sans Arabic for Arabic |
| Analytics | Vercel Analytics + Plausible | No cookies, GDPR/loi 09-08 compliant |
| Deployment | Netlify | Domain: `centresoutien.com`. Config in `netlify.toml` at repo root; `@netlify/plugin-nextjs` for the Node runtime. |
| Package manager | **pnpm** | Same as the desktop app. Never use npm or yarn. |

---

## 3. Commands

```bash
pnpm dev              # Dev server on :3000
pnpm build            # Production build (must pass before merging anything)
pnpm start            # Serve production build locally
pnpm lint             # ESLint — must return 0 warnings
pnpm typecheck        # tsc --noEmit — must pass
pnpm format           # Prettier
pnpm lhci             # Lighthouse CI — thresholds enforced in .lighthouserc.json
```

Before opening a PR: `pnpm lint && pnpm typecheck && pnpm build && pnpm test`. All four must pass.

---

## 4. How to Work in This Repo

### 4.1 Brainstorm before coding

Any task larger than "fix this typo" starts with a brainstorm turn, not a code turn. When given a task:

1. **Restate the goal** in your own words — one sentence.
2. **List 2–3 approaches** with tradeoffs. Even if one is obviously best, name the alternatives so the tradeoff is explicit.
3. **Pick one and justify** it in terms of this project's priorities: SEO first, performance second, DX third.
4. **Sketch the file changes** as a bullet list before writing any code.
5. Only then start editing.

If the task is ambiguous, ask before guessing. A wrong guess wastes more time than a clarifying question.

### 4.2 Small, reviewable changes

- One concern per PR. If a change touches routing *and* adds a new section *and* refactors the header, split it.
- Prefer 3 small PRs over 1 large one.
- Every PR includes: what changed, why, and a Lighthouse before/after if the change touches the critical rendering path.

### 4.3 Conventional Commits

```
feat: add pricing comparison table
fix: correct RTL alignment on hero CTA
perf: replace hero PNG with AVIF, drop LCP by 400ms
seo: add SoftwareApplication JSON-LD
i18n: translate FAQ section to Arabic
chore: bump next to 15.2.1
docs: expand SEO section in CLAUDE.md
```

---

## 5. Code Principles

### 5.1 SOLID, applied to React

- **S — Single Responsibility.** A component does one thing. If a component's name needs "and" to describe it, split it. `<PricingCard />` renders one card; `<PricingSection />` composes three.
- **O — Open/Closed.** Extend via composition and props, not by editing existing components. If `<Button />` needs a new variant, add it via `variants` in cva, don't fork the component.
- **L — Liskov Substitution.** Variants of a component must be interchangeable. A `<Button variant="ghost">` must accept the same props as `<Button variant="primary">`.
- **I — Interface Segregation.** Prop interfaces stay small and focused. Don't take a giant `config` object when 3 named props would do. Split large interfaces into smaller ones a component actually uses.
- **D — Dependency Inversion.** Components depend on types and props, not on concrete data sources. A `<TestimonialCard />` takes a `Testimonial` type, not `fetch('/api/testimonials')`.

### 5.2 Other rules that matter here

- **DRY, but not prematurely.** Three copies is the threshold for extraction, not two.
- **KISS.** A `<section>` with Tailwind classes beats a "reusable section engine" every time on a landing page.
- **YAGNI.** No abstractions for imaginary future needs. Add them when the second use case actually appears.
- **Colocation.** Component + its styles + its tests + its types live in the same folder.
- **Explicit over clever.** A slightly longer readable name beats a clever short one.
- **Server Components by default.** Add `'use client'` only when you need state, effects, or browser APIs. Every `'use client'` boundary is a bundle cost — justify it.
- **No prop drilling past 2 levels.** If you're threading a prop through 3+ components, lift to context or restructure.

### 5.3 TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`.
- Types near the code that uses them. Global types only for truly shared shapes (`Locale`, `Testimonial`).
- Prefer `type` over `interface` for props. Reserve `interface` for things meant to be extended.
- No `any`. If you truly need an escape hatch, use `unknown` and narrow.

---

## 6. File Structure

```
.
├── app/
│   ├── [locale]/                     # fr | ar
│   │   ├── layout.tsx                # Root layout: fonts, dir, metadata
│   │   ├── page.tsx                  # Landing page — composes sections
│   │   ├── mentions-legales/page.tsx
│   │   ├── cgv/page.tsx
│   │   ├── confidentialite/page.tsx
│   │   └── programme-fondateur/page.tsx
│   ├── api/
│   │   └── founder/route.ts          # POST — Founder Program application
│   ├── globals.css                   # Tailwind + design tokens
│   ├── sitemap.ts                    # Auto-generated sitemap
│   ├── robots.ts                     # robots.txt
│   └── opengraph-image.tsx           # Default OG image
├── components/
│   ├── ui/                           # shadcn primitives — do not edit lightly
│   ├── sections/                     # One file per landing section
│   │   ├── header.tsx
│   │   ├── hero.tsx
│   │   ├── problem.tsx
│   │   ├── features.tsx
│   │   ├── how-it-works.tsx
│   │   ├── pricing.tsx
│   │   ├── founder-program.tsx
│   │   ├── testimonials.tsx
│   │   ├── faq.tsx
│   │   ├── final-cta.tsx
│   │   └── footer.tsx
│   ├── common/                       # Cross-section reusables
│   └── seo/                          # JsonLd, canonical helpers
├── content/
│   ├── fr/                           # French copy as MDX or JSON
│   └── ar/                           # Arabic copy
├── i18n/
│   ├── request.ts
│   ├── routing.ts
│   └── messages/{fr,ar}.json
├── lib/
│   ├── utils.ts                      # cn(), formatters
│   ├── analytics.ts
│   └── validators.ts                 # Zod schemas
├── public/
│   ├── screenshots/                  # App screenshots, AVIF + WebP fallback
│   ├── og/                           # Static OG images per locale
│   └── favicon/
├── CLAUDE.md                         # This file
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## 7. SEO — the most important section of this file

This site's ranking is a business KPI. Treat SEO decisions as product decisions.

### 7.1 Metadata

Every route exports `metadata` (or `generateMetadata` for dynamic routes) with:
- `title` — max 60 chars, includes the primary keyword
- `description` — max 160 chars, actionable, includes the primary keyword once
- `openGraph` — image, title, description, locale, type
- `twitter` — `card: "summary_large_image"`
- `alternates.canonical` — absolute URL
- `alternates.languages` — `{ fr: "...", ar: "..." }` for hreflang

Never let a page ship without OG image and canonical set.

### 7.2 Structured data (JSON-LD)

Emit at minimum on the homepage:
- `Organization` — with `sameAs` links to social
- `SoftwareApplication` — with `applicationCategory: "BusinessApplication"` and `operatingSystem: "Windows, macOS"` (no `offers`: prices are no longer displayed, SOU-308)
- `FAQPage` — mirrors the visible FAQ, question-for-question
- `BreadcrumbList` on interior pages

Use a `<JsonLd data={...} />` component in `components/seo/`. Never inline `<script>` tags in pages.

### 7.3 hreflang and locales

- URL structure: `/fr/...` (default) and `/ar/...`.
- `<html lang="fr" dir="ltr">` and `<html lang="ar" dir="rtl">`.
- Every page emits reciprocal hreflang tags: `fr-MA`, `ar-MA`, `x-default` → French.
- Never use JS to swap languages — server-side rendered locales only.

### 7.4 Sitemap and robots

- `app/sitemap.ts` generates entries for every locale × every route.
- `app/robots.ts` allows all except `/api/*`, points to sitemap.
- Submit to Google Search Console for both `centresoutien.com` and any subdomain.

### 7.5 Content SEO

- One `<h1>` per page. Includes the primary keyword.
- Section headings use `<h2>`, sub-sections `<h3>`. Never skip levels.
- Alt text on every image, describes the *content* (not "hero image").
- Internal links use descriptive anchor text ("voir les tarifs" not "cliquez ici").
- Every landing section has a stable `id` for anchor links (`#tarifs`, `#faq`).

### 7.6 Technical SEO

- Static rendering wherever possible. The homepage must be fully static.
- No client-side redirects. All redirects in `next.config.ts`.
- Trailing slash policy: **no trailing slash**. Enforce in config.
- 404 page returns proper 404 status, not 200.
- Test with `curl -I` before shipping.

### 7.7 Performance budgets (which are also SEO)

Enforced by Lighthouse CI on every PR:

| Metric | Threshold |
|---|---|
| LCP | < 2.0s |
| CLS | < 0.05 |
| INP | < 150ms |
| Total blocking time | < 200ms |
| Performance score | ≥ 95 |
| SEO score | 100 |
| Accessibility score | ≥ 95 |
| JS bundle (initial) | < 90kb gzipped |

If a change pushes any metric past its budget, either fix it or open a discussion in the PR before merging.

### 7.8 Images

- `next/image` for everything. No raw `<img>` on the landing page.
- Source format: AVIF with WebP fallback. Provide `width` and `height` to prevent CLS.
- Hero screenshot: `priority` prop set, `fetchPriority="high"`.
- Every other image: lazy by default (Next handles this).

### 7.9 Fonts

- Self-hosted via `next/font/local` — variable woff2 files vendored in `app/fonts/` (latin-subset Inter, arabic-subset Noto Sans Arabic) — with `display: "swap"`. No build-time Google Fonts fetch (a runner network hiccup once failed the landing build; SOU-229).
- Preload only the fonts used above the fold (Inter regular + semibold).
- Arabic font loaded only on `/ar/*` routes.

---

## 8. Internationalization

- Library: `next-intl`.
- All user-facing strings live in `i18n/messages/{fr,ar}.json`. No hardcoded strings in JSX.
- Message keys are hierarchical: `hero.headline`, `pricing.tiers.pro.name`.
- French is the default and the source of truth. Arabic follows the French key structure exactly.
- Dates and numbers use `Intl` APIs with the right locale. MAD amounts always formatted with `Intl.NumberFormat(locale, { style: "currency", currency: "MAD" })`.
- RTL is enforced via `dir="rtl"` on `<html>` for Arabic — never with per-component flips.
- Tailwind logical properties (`ps-4`, `pe-4`, `ms-auto`, `text-start`) instead of directional ones (`pl-4`, `pr-4`, `ml-auto`, `text-left`). This is non-negotiable — a `pl-4` in a shared component will break Arabic.
- Test every new section in both locales before considering it done.

---

## 9. Accessibility

Target: WCAG 2.1 AA. Non-negotiable items:

- Semantic HTML: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`.
- Every interactive element is keyboard reachable and has a visible focus ring.
- Color contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI elements.
- Form inputs have associated `<label>`s (never just placeholders).
- Icons that convey meaning have `aria-label`; decorative icons have `aria-hidden="true"`.
- Skip-to-content link at the top of the layout.
- Respect `prefers-reduced-motion`.
- Test with keyboard only and with VoiceOver / NVDA before shipping any interactive section.

---

## 10. Component Patterns

### 10.1 shadcn primitives

- Installed via `pnpm dlx shadcn@latest add <component>`.
- Live in `components/ui/` and are edited only to add variants or fix accessibility issues, not to change core behavior.
- If a shadcn component doesn't fit, wrap it — don't fork it.

### 10.2 Section components

A landing section component:
- Is a Server Component unless it needs client state.
- Takes no props from the page level (content comes from `next-intl`).
- Owns its own layout wrapper (`<section id="..." className="py-24">`).
- Exports a single default component named after the section (`Hero`, `Pricing`).
- Has a corresponding entry in `content/{locale}/` if it has non-trivial copy.

### 10.3 The `cn()` utility

Use `cn()` from `lib/utils.ts` for any conditional class logic. Never string-concatenate Tailwind classes with `+`.

### 10.4 Forms

- Client Components (need state).
- Validation with Zod. The same schema validates on both client and server.
- Server Actions for submission, not client-side `fetch` to `/api`.
- Show inline errors, not toasts, for field-level validation. Toasts (Sonner) are for submission results.

---

## 11. Testing

- **Unit Test:** no need to implement unit or e2e testing.

---

## 12. Analytics and Privacy

- Vercel Analytics (built-in) + Plausible for detailed events.
- No third-party pixels (Facebook, Google Ads) without a documented cookie consent flow.
- Loi 09-08 (Moroccan data protection) applies. The `/confidentialite` page documents what we collect.
- The Founder Program form stores submissions in a database (schema TBD) and sends an email notification. Never log form contents to console or analytics.

---

## 13. What NOT to do

- ❌ Don't add a component library other than shadcn/ui. No Material, no Chakra, no daisyUI.
- ❌ Don't fetch data client-side that could be static. This site is 99% static.
- ❌ Don't add animations that don't respect `prefers-reduced-motion`.
- ❌ Don't hardcode strings — everything goes through `next-intl`.
- ❌ Don't use `pl-*`, `pr-*`, `ml-*`, `mr-*`, `text-left`, `text-right`. Use logical properties.
- ❌ Don't ship a page without OG image, canonical, and hreflang.
- ❌ Don't ship a `'use client'` component without justifying why in the PR description.
- ❌ Don't merge if any of: lint, typecheck, build, or Lighthouse thresholds fail.
- ❌ Don't invent new visual elements without checking the design source of truth first.
- ❌ Don't put personal data (names, emails, phones) in URL query strings — ever.

---

## 14. When in doubt

1. Re-read section 7 (SEO) and section 5 (SOLID). Most decisions on this repo come down to one of them.
2. Check the design link in section 1 before adding UI.
3. If the answer isn't there, ask a clarifying question in the PR or issue — don't guess.

---

*Last updated: keep this line — bump the date when the file changes materially.*

