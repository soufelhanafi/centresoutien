---
name: i18n-add-string
description: Add or modify user-facing text in the Centre Soutien Next.js repo the right way — through next-intl message files in both French and Arabic. Use this skill whenever text is added to any component, page, form, alt attribute, aria-label, meta title/description, or JSON-LD block that a user might read. Trigger even when the user says "just add a label" or "quick copy change" — hardcoded strings are the #1 source of missing translations and broken RTL. Also trigger on phrases like "add copy", "change wording", "translate", "add a section title", or when reviewing a diff that includes visible text.
---

# i18n Add-String Skill

Every user-facing string in this repo goes through `next-intl`. No exceptions, no "we'll translate it later". This skill is the procedure for adding text correctly the first time.

---

## Step 1 — Identify every visible string in the change

Before touching any file, list every string that will be visible to a user, including:

- Body text, headings, button labels
- Placeholders and helper text on form inputs
- Validation error messages
- Empty states
- Toast / notification text
- Alt attributes and aria-labels
- Meta title, description, and OpenGraph text
- JSON-LD text fields (`headline`, `description`, `name`, FAQ questions/answers)
- URL slugs *if they are user-facing* (e.g. `/fr/programme-fondateur`)

If a string appears in more than one place, it still gets one key — reuse it.

---

## Step 2 — Choose the key name

Keys are hierarchical, snake-cased at the segment level, and describe the location + purpose. Never describe the content.

**Good:**
```
hero.headline
hero.cta.primary
pricing.tiers.pro.name
pricing.tiers.pro.description
pricing.tiers.pro.features.0
faq.items.offline.question
faq.items.offline.answer
founder_form.fields.center_name.label
founder_form.fields.center_name.placeholder
founder_form.errors.center_name.required
```

**Bad:**
```
hero_title                          # flat, not hierarchical
save_your_weekends_from_excel       # describes content
h1                                  # describes the tag, not the purpose
misc.text_1                         # meaningless
```

**Rules:**
- Segments in `snake_case`.
- Nesting depth ≤ 4. If you need deeper, restructure.
- Related strings share a prefix (`founder_form.*` for everything in the Founder form).
- Never encode the language, tone, or content in the key.

---

## Step 3 — Add the French version first

French is the source of truth. Open `i18n/messages/fr.json` and add the key in its correct place in the hierarchy. Preserve alphabetical order within a level.

Example:
```json
{
  "hero": {
    "badge": "🇲🇦 Fabriqué au Maroc",
    "headline": "Gérez votre centre de soutien sans Excel, sans stress.",
    "subheadline": "Planning, élèves, factures — tout au même endroit, hors ligne.",
    "cta": {
      "primary": "Essai gratuit 14 jours",
      "secondary": "Voir la démo"
    },
    "trust": {
      "no_card": "Sans carte bancaire",
      "quick_install": "Installation en 5 min",
      "local_data": "Données stockées localement"
    }
  }
}
```

**French copy rules:**
- Full sentences with correct capitalization and punctuation.
- Use non-breaking spaces before `:`, `;`, `!`, `?` (`\u00a0` in JSON).
- Currency: `3\u00a0490\u00a0MAD` (non-breaking spaces, no `DH`).
- No English fragments mixed in (no "download", say "télécharger").

---

## Step 4 — Add the Arabic version at the same key

Open `i18n/messages/ar.json`. Mirror the exact key structure from `fr.json`. Never add an Arabic key that doesn't exist in French, and never leave a French key without an Arabic counterpart.

Example:
```json
{
  "hero": {
    "badge": "🇲🇦 صُنع في المغرب",
    "headline": "أدر مركز الدعم المدرسي دون إكسل ودون توتر.",
    "subheadline": "الجدولة والطلاب والفواتير — كل شيء في مكان واحد، دون اتصال بالإنترنت.",
    "cta": {
      "primary": "تجربة مجانية لمدة 14 يومًا",
      "secondary": "شاهد العرض التوضيحي"
    },
    "trust": {
      "no_card": "بدون بطاقة بنكية",
      "quick_install": "تثبيت في 5 دقائق",
      "local_data": "البيانات مخزنة محليًا"
    }
  }
}
```

**Arabic copy rules:**
- Use Modern Standard Arabic (فُصْحَى), not Moroccan Darija, for institutional feel.
- Numbers: Latin digits (`14`, `50`, `3 490 MAD`) — do not use Eastern Arabic numerals. Directors are used to Latin digits in business contexts.
- Currency: `3 490 درهم` or `3 490 MAD` — consistent with the FR side.
- Do not translate proper nouns (product name "Centre Soutien" stays Latin unless there's a decided Arabic brand form).
- Punctuation: use Arabic punctuation (`،` `؛` `؟`) not Latin.

If unsure about a translation, add a `// TODO(ar):` comment above the entry and flag it for review — do not ship an English placeholder or a raw French string in the Arabic file.

---

## Step 5 — Use the key in the component

Import from `next-intl` and reference the key:

```tsx
import { useTranslations } from 'next-intl';

export function Hero() {
  const t = useTranslations('hero');

  return (
    <section id="hero" className="py-24">
      <span className="text-sm">{t('badge')}</span>
      <h1 className="text-5xl font-semibold">{t('headline')}</h1>
      <p className="text-lg">{t('subheadline')}</p>
      <div className="mt-8 flex gap-4">
        <Button size="lg">{t('cta.primary')}</Button>
        <Button size="lg" variant="ghost">{t('cta.secondary')}</Button>
      </div>
    </section>
  );
}
```

- For Server Components, import from `next-intl/server` and use `await getTranslations('namespace')`.
- Never string-concatenate translations. If a sentence has an inline value, use ICU:
  ```json
  "pricing.starting_at": "À partir de {price} MAD par an"
  ```
  ```tsx
  t('starting_at', { price: 1490 })
  ```

---

## Step 6 — Handle rich text carefully

For strings that contain formatting (bold, links), use `<t.rich>` with named tags:

```json
"founder.description": "Rejoignez le <highlight>programme fondateur</highlight> avant la fermeture des inscriptions."
```

```tsx
t.rich('description', {
  highlight: (chunks) => <strong className="text-primary">{chunks}</strong>
})
```

Never put HTML tags inside the JSON string. Never use `dangerouslySetInnerHTML` for translated text.

---

## Step 7 — Verify

Before considering the change done:

- [ ] The key exists in **both** `fr.json` and `ar.json`.
- [ ] The key structure is identical in both files (same nesting, same names).
- [ ] Grep for the raw string — it should appear only in the JSON files, nowhere in TSX:
  ```bash
  # Replace with your actual added string
  grep -rn "Essai gratuit 14 jours" app/ components/ content/
  ```
  The only match should be in `fr.json`.
- [ ] Run `pnpm dev` and visit both `/fr/` and `/ar/`. The new text appears in both.
- [ ] On `/ar/`, verify the text renders right-aligned and the surrounding layout mirrored correctly. If it didn't, run the `rtl-check` skill next.
- [ ] Verify non-breaking spaces render correctly (view source).
- [ ] `pnpm typecheck` passes — next-intl types the keys, so missing keys break the build.

---

## Anti-patterns to reject

- **Hardcoded string in JSX:** `<h1>Bienvenue</h1>` — must be `<h1>{t('welcome')}</h1>`.
- **String in alt attribute:** `<Image alt="Capture d'écran du dashboard" />` — must be `<Image alt={t('dashboard_alt')} />`.
- **String in aria-label:** `<button aria-label="Fermer">` — must use `t()`.
- **English fallback in `ar.json`:** never ship English or French text as an "Arabic" placeholder.
- **Different key structure between FR and AR:** the two files must have the same shape.
- **String concatenation:** `t('greeting') + ' ' + name` — must be `t('greeting_named', { name })` with an ICU parameter.
- **Adding a key to only one file "for now":** breaks the site in the other locale silently. Both files, every time.

---

## When adding a whole new section

If the change adds a whole landing section (not just a few strings), also:

- [ ] Add a section entry to the FAQ / sitemap if user-visible.
- [ ] Add anchor link entries in the header nav (both locales).
- [ ] Run the `seo-audit` skill on the containing page.
- [ ] Screenshot both `/fr/` and `/ar/` of the new section to verify RTL mirroring.
