---
name: seo-audit
description: Audit and enforce SEO correctness on any page or metadata change in the Centre Soutien Next.js repo. Use this skill whenever a page is created or edited, metadata is touched, a `<head>` tag or `generateMetadata` function changes, images or fonts are modified, sitemap or robots are updated, structured data (JSON-LD) is added, or any change touches the URL structure or i18n routing. Trigger even if the user does not explicitly ask for an SEO check — SEO is a business KPI on this project and every page change is an SEO change. Also trigger on phrases like "add a page", "update meta", "improve ranking", "Lighthouse", "hreflang", "canonical", "sitemap", or "search console".
---

# SEO Audit Skill

This skill runs a full SEO audit against a Next.js page or metadata change. Follow the procedure in order — do not skip steps. SEO score of 100 and Lighthouse ≥ 95 are hard requirements, not aspirations.

---

## When to run this

- After creating any new page under `app/[locale]/`
- After editing `metadata` or `generateMetadata` on any page
- After changing anything in `<head>` (fonts, scripts, links)
- After adding or modifying JSON-LD structured data
- After touching `sitemap.ts`, `robots.ts`, or `next.config.ts` redirects/headers
- Before merging any PR that touches the routing or content structure

---

## Step 1 — Metadata correctness

For every changed page, verify:

- [ ] `metadata` (or `generateMetadata`) is exported. Never rely on defaults.
- [ ] `title` — 30–60 chars. Includes the primary keyword. Distinct from any other page.
- [ ] `description` — 120–160 chars. Actionable (verb-led). Includes the primary keyword once.
- [ ] `openGraph.title` set (may match `title`).
- [ ] `openGraph.description` set (may match `description`).
- [ ] `openGraph.images` — at least one 1200×630 image. Absolute URL, not relative.
- [ ] `openGraph.locale` — `"fr_MA"` or `"ar_MA"`.
- [ ] `openGraph.type` — `"website"` for landing pages.
- [ ] `twitter.card: "summary_large_image"`.
- [ ] `alternates.canonical` — absolute URL, no trailing slash.
- [ ] `alternates.languages` — object mapping `"fr-MA"` and `"ar-MA"` to their absolute URLs.

Verify with:
```bash
curl -sI https://centresoutien.com/fr/ | grep -i "content-type\|location"
```

And in the running dev server:
```bash
curl -s http://localhost:3000/fr/ | grep -E "<title>|<meta name=\"description\"|<link rel=\"canonical\"|<link rel=\"alternate\""
```

Every expected tag must appear exactly once.

---

## Step 2 — Structured data (JSON-LD)

For the homepage (`/fr/` and `/ar/`), verify these JSON-LD blocks are present:

- [ ] `Organization` — includes `name`, `url`, `logo`, `sameAs` (social links).
- [ ] `SoftwareApplication` — `applicationCategory: "BusinessApplication"`, `operatingSystem: "Windows, macOS"`, `offers` array with the three tiers.
- [ ] `FAQPage` — one `Question` per visible FAQ item, question and answer text match the rendered content exactly.
- [ ] `WebSite` — with `potentialAction` `SearchAction` only if site search exists (skip otherwise).

For interior pages, verify:
- [ ] `BreadcrumbList` — reflects the actual breadcrumb hierarchy.

Validation:
```bash
# Extract and validate JSON-LD from the rendered page
curl -s http://localhost:3000/fr/ \
  | grep -o '<script type="application/ld+json">[^<]*</script>' \
  | sed 's/<[^>]*>//g' \
  | jq .
```

Every block must be valid JSON. Then paste each block into https://validator.schema.org — no errors, no warnings.

**Never** use inline `<script>` tags in pages. Always use the `<JsonLd data={...} />` component in `components/seo/`.

---

## Step 3 — hreflang and locale correctness

For every localized page, verify:

- [ ] `<html lang="fr" dir="ltr">` on `/fr/*` routes.
- [ ] `<html lang="ar" dir="rtl">` on `/ar/*` routes.
- [ ] Reciprocal `<link rel="alternate" hreflang="...">` tags for `fr-MA`, `ar-MA`, and `x-default` (→ French).
- [ ] Every hreflang URL is absolute and returns 200.
- [ ] URLs follow the pattern `/{locale}/{route}` — no missing locale, no double locale.

Check with:
```bash
curl -s http://localhost:3000/fr/tarifs | grep 'hreflang'
curl -s http://localhost:3000/ar/tarifs | grep 'hreflang'
```

The two outputs must reference each other reciprocally.

---

## Step 4 — Content SEO

For the changed page:

- [ ] Exactly one `<h1>`. Contains the primary keyword. Descriptive, not decorative.
- [ ] Heading hierarchy is unbroken: `<h1>` → `<h2>` → `<h3>`. No skipped levels.
- [ ] Every `<img>` (or `<Image>`) has a meaningful `alt`. Describes content, not "hero image" or "".
- [ ] Decorative images use `alt=""` explicitly (not omitted).
- [ ] Internal links have descriptive anchor text. No "cliquez ici" / "click here".
- [ ] External links use `rel="noopener"` (add `noreferrer` only for untrusted sources).
- [ ] Landing sections have stable `id` attributes for anchor links (`#tarifs`, `#faq`, `#fonctionnalites`).
- [ ] No text baked into images that could be HTML text.

Grep for common regressions:
```bash
grep -rn 'alt=""' app/ components/       # should only appear on decorative images
grep -rn 'cliquez ici\|click here' app/ content/
grep -rn '<h1' app/ components/           # count occurrences per page
```

---

## Step 5 — Technical SEO

- [ ] Page is statically rendered (`export const dynamic = 'force-static'` if in doubt). Homepage MUST be static.
- [ ] No client-side redirects. All redirects live in `next.config.ts`.
- [ ] Trailing slash policy is consistent: **no trailing slash**. Verify:
  ```bash
  curl -sI http://localhost:3000/fr/tarifs/ | head -1   # should be 308 → /fr/tarifs
  ```
- [ ] 404 page returns HTTP 404, not 200:
  ```bash
  curl -sI http://localhost:3000/fr/does-not-exist | head -1
  ```
- [ ] `robots.txt` allows crawling of public routes, disallows `/api/*`, points to sitemap.
- [ ] `sitemap.xml` includes every locale × every public route, no stale entries, `<lastmod>` present.

---

## Step 6 — Performance (which is SEO)

Run:
```bash
pnpm build && pnpm start &
pnpm lhci --collect.url=http://localhost:3000/fr/ --collect.url=http://localhost:3000/ar/
```

Enforced thresholds:

| Metric | Target |
|---|---|
| Performance | ≥ 95 |
| SEO | 100 |
| Accessibility | ≥ 95 |
| Best Practices | ≥ 95 |
| LCP | < 2.0s |
| CLS | < 0.05 |
| INP | < 150ms |
| TBT | < 200ms |
| Initial JS bundle | < 90 kB gzipped |

If any metric fails, do not merge. Diagnose with:
- **Slow LCP?** Check `priority` and `fetchPriority` on the hero image; verify `next/font` preload; check for render-blocking scripts.
- **High CLS?** Check every `<Image>` has `width`/`height`; check web fonts have `display: swap` and a sane fallback stack.
- **Fat bundle?** Check for accidental `'use client'` at high levels; check for large client-only libraries; run `pnpm build` and inspect the route-by-route bundle report.

---

## Step 7 — Images and fonts

- [ ] All images use `next/image`. No raw `<img>` tags on the landing page.
- [ ] Source format is AVIF with WebP fallback (Next handles this via `next.config.ts`).
- [ ] Every image has explicit `width` and `height`.
- [ ] The hero image has `priority` and `fetchPriority="high"`.
- [ ] All other images are lazy by default (Next default).
- [ ] Fonts self-hosted via `next/font/local` (vendored woff2 in `app/fonts/`) with `display: "swap"`.
- [ ] Only above-the-fold fonts (Inter regular + semibold) are preloaded.
- [ ] Arabic font (Noto Sans Arabic) loads only on `/ar/*` routes.

Grep:
```bash
grep -rn '<img ' app/ components/                       # should return nothing on landing routes
grep -rn 'priority\|fetchPriority' components/sections/hero
```

---

## Step 8 — The final gate

Only after all steps above pass:

- [ ] Test the sitemap in Search Console (or via `curl` for now).
- [ ] Test the JSON-LD in https://validator.schema.org and Google's Rich Results Test.
- [ ] Test the page in a real browser with DevTools throttled to Slow 4G — LCP should still feel snappy.
- [ ] Screenshot the Lighthouse report and attach to the PR.

If any of the above surfaces a regression, fix it before merge. SEO regressions ship silently — only this audit catches them before they hit production.

---

## Common regressions this catches

- Someone added `'use client'` to a section and now the homepage's JS bundle doubled.
- A new page was added with no `metadata` export → default title and no OG image.
- Hreflang tags reference URLs that 404 in the other locale (typo in the URL).
- A JSON-LD block references `sameAs` URLs that don't resolve.
- An image was added without `width`/`height` → CLS regression.
- A `<h2>` was skipped and `<h3>` appears under `<h1>` directly.
- A "read more" link ships to production because "en savoir plus" was forgotten in the FR JSON.
