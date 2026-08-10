---
name: add-landing-section
description: Add a new section to the Centre Soutien landing page — from design reference to shipped code — the correct way for this repo. Use this skill whenever a new section is added to any landing page, when an existing section is significantly restructured, or when the user says things like "add a section", "let's add a testimonials block", "insert a new pricing tier", "add a hero variant", or "put this new content between X and Y on the page". This skill coordinates the other skills (SEO, i18n, RTL, SOLID) into a single procedure — trigger it before doing the work, not after.
---

# Add Landing Section Skill

Adding a section to the landing page touches design, SOLID, i18n, RTL, SEO, and performance — all at once. This skill sequences the work so nothing gets skipped.

---

## Step 1 — Verify against the design source of truth

Open the design link stored in `CLAUDE.md` section 1 (Claude Design conversation). The section being added must exist there. If it doesn't:

- **Ask the user** whether to add it to the design first, or to proceed with a code-first pass they'll refine visually later.
- Do not invent visual specifics (colors, typography, layout) that aren't in the design.

Note down from the design:
- Section purpose and target audience
- Copy (headline, body, CTA labels)
- Visual anchors (images, screenshots, icons)
- Layout at desktop, tablet, mobile
- RTL layout expectation

---

## Step 2 — Brainstorm the shape

Before writing code, answer:

- **Server or Client Component?** Default to Server. Only make it Client if it needs state, effects, or event handlers.
- **How many sub-components?** A section with 3 pricing cards is 2 files: `pricing.tsx` (the section) and `pricing-card.tsx` (the card). A hero with one CTA is 1 file.
- **Where does the copy live?** Every user-visible string goes through `next-intl`. Draft the key structure now, before writing the JSX.
- **Any new UI primitives needed?** If yes, invoke the `shadcn-add-component` skill first.
- **Does this section need structured data (JSON-LD)?** Testimonials → `Review` schema. FAQ → `FAQPage`. Pricing → belongs in the page-level `SoftwareApplication.offers`. Note this now.
- **Anchor `id` for jump links?** Choose the URL fragment now (`#temoignages`, `#tarifs`).

Write these decisions down as bullets in the PR description before writing code.

---

## Step 3 — Create the folder and files

Follow the colocation pattern from `CLAUDE.md`:

```
components/sections/testimonials/
├── testimonials.tsx        # section component
├── testimonial-card.tsx    # card component (if reusable within the section)
├── testimonials.types.ts   # types (only if they don't fit inline)
└── index.ts                # barrel export
```

The barrel:
```tsx
// components/sections/testimonials/index.ts
export { Testimonials } from './testimonials';
```

---

## Step 4 — Write the section as a Server Component

Default template:

```tsx
// components/sections/testimonials/testimonials.tsx
import { getTranslations } from 'next-intl/server';
import { TestimonialCard } from './testimonial-card';
import type { Testimonial } from '@/lib/types/testimonial';

const testimonials: readonly Testimonial[] = [
  // Static data lives here or in content/{locale}/
];

export async function Testimonials() {
  const t = await getTranslations('testimonials');

  return (
    <section
      id="temoignages"
      className="mx-auto max-w-6xl px-4 py-24"
      aria-labelledby="testimonials-heading"
    >
      <div className="mb-16 text-center">
        <h2 id="testimonials-heading" className="text-3xl font-semibold sm:text-4xl">
          {t('heading')}
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          {t('subheading')}
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {testimonials.map((testimonial) => (
          <TestimonialCard key={testimonial.id} testimonial={testimonial} />
        ))}
      </div>
    </section>
  );
}
```

Rules applied here:
- Server Component (no `'use client'`)
- Semantic HTML (`<section>`, `<h2>`, ARIA labelling)
- Anchor `id` for jump links
- All strings via `next-intl`
- Logical properties only (no `pl-`, `pr-`, etc.)
- Composition (delegates card rendering to `<TestimonialCard />`)
- Typed data (readonly)

---

## Step 5 — Add the copy to both locale files

Now run the `i18n-add-string` procedure. Every string used in the section must be added to both `fr.json` and `ar.json` with matching key structure.

Example minimum entries:
```json
// fr.json
{
  "testimonials": {
    "heading": "Ils ont quitté Excel",
    "subheading": "Trois centres de soutien nous font confiance depuis leur premier jour.",
    "cards": {
      "karim": {
        "quote": "Avant, je passais mes dimanches sur Excel. Maintenant, j'ai retrouvé mes week-ends.",
        "name": "Karim Alaoui",
        "role": "Directeur",
        "center": "Centre Al Massar",
        "city": "Casablanca"
      }
    }
  }
}
```

```json
// ar.json
{
  "testimonials": {
    "heading": "لقد ودّعوا إكسل",
    "subheading": "ثلاثة مراكز دعم مدرسي تثق بنا منذ اليوم الأول.",
    "cards": {
      "karim": {
        "quote": "كنت أقضي أيام الأحد على إكسل. الآن استعدت عطل نهاية الأسبوع.",
        "name": "كريم العلوي",
        "role": "مدير",
        "center": "مركز المسار",
        "city": "الدار البيضاء"
      }
    }
  }
}
```

---

## Step 6 — Wire the section into the page

Import it in the page component in the correct order:

```tsx
// app/[locale]/page.tsx
import { Hero } from '@/components/sections/hero';
import { Problem } from '@/components/sections/problem';
import { Features } from '@/components/sections/features';
import { HowItWorks } from '@/components/sections/how-it-works';
import { Pricing } from '@/components/sections/pricing';
import { FounderProgram } from '@/components/sections/founder-program';
import { Testimonials } from '@/components/sections/testimonials';
import { FAQ } from '@/components/sections/faq';
import { FinalCTA } from '@/components/sections/final-cta';

export default function LandingPage() {
  return (
    <main>
      <Hero />
      <Problem />
      <Features />
      <HowItWorks />
      <Pricing />
      <FounderProgram />
      <Testimonials />
      <FAQ />
      <FinalCTA />
    </main>
  );
}
```

Verify the scroll order matches the design.

---

## Step 7 — Update the header nav

If the new section has an anchor link, add it to the header navigation:

- Add the label to both `fr.json` and `ar.json` under `nav.*`.
- Add the anchor `href` to the nav config.
- Verify the smooth-scroll behavior works.
- Verify the anchor also works from other pages (e.g., `/fr/programme-fondateur#tarifs` navigates and scrolls).

---

## Step 8 — Add structured data if applicable

Depending on the section type:

- **Testimonials → `Review` (nested in `Organization` or `SoftwareApplication`)** — one entry per visible testimonial.
- **FAQ → `FAQPage`** — mirror every visible Q&A.
- **Pricing → `Offer` entries in the page-level `SoftwareApplication`.**
- **New standalone page → `BreadcrumbList`.**

Add the JSON-LD via the `<JsonLd data={...} />` component in `components/seo/`, imported into the page component (not the section — JSON-LD belongs at the page level).

---

## Step 9 — Run the checks

In order:

1. **SOLID gates.** Every component in the new section passes each SOLID check from the `solid-coding` skill.
2. **i18n check.** Grep for any hardcoded string in the new section files. There should be none.
3. **RTL check.** Run the `rtl-check` skill against the changed files. Zero directional classes. Open `/ar/` and confirm the section mirrors correctly.
4. **SEO audit.** Run the `seo-audit` skill on the page. Metadata unchanged (unless the section is on a new page), heading hierarchy still unbroken, structured data valid.
5. **Type + lint.** `pnpm typecheck && pnpm lint`.
6. **Build.** `pnpm build` completes with no errors and no new warnings.
7. **Lighthouse.** `pnpm lhci` still passes all thresholds. If Performance dropped, investigate before merging.

---

## Step 10 — Screenshot

Take three screenshots:

1. The new section on desktop `/fr/`.
2. The new section on desktop `/ar/`.
3. The new section on mobile `/fr/`.

Attach to the PR. This is the fastest way for a reviewer to catch layout regressions.

---

## Common regressions this catches

- Section added but only in `fr.json` — Arabic locale shows key names instead of text.
- Anchor `id` collides with an existing one (`#tarifs` already used by pricing).
- Section is a Client Component "just in case" and adds 30kb to the initial bundle.
- Section uses `pl-8` and looks fine in FR, broken in AR.
- Section adds a new UI primitive by hand-writing it instead of installing shadcn.
- Section renders "Bienvenue" hardcoded and the string never gets translated.
- Section adds testimonials without corresponding JSON-LD, losing rich-result eligibility.
- Section is added to the page component in the wrong scroll order.

---

## When the section is truly one-off

If the section is genuinely unique to one page (a legal page, a thank-you page) and unlikely to be composed with others:

- Skip the barrel export and the folder — put it inline in the page file.
- Still add strings to both locales.
- Still add anchor `id` if user-visible.
- Still run SEO, RTL, and Lighthouse checks.

Simplicity beats structure when structure is speculative. But most landing sections are worth the folder.
