---
name: rtl-check
description: Catch and fix right-to-left (RTL) layout bugs in the Centre Soutien Next.js repo before they ship. Use this skill after any styling, layout, or component change — even one that "shouldn't affect RTL". Directional Tailwind classes (`pl-*`, `pr-*`, `ml-*`, `mr-*`, `text-left`, `text-right`, `left-*`, `right-*`, `border-l-*`, `border-r-*`, `rounded-l-*`, `rounded-r-*`, `translate-x-*`, `space-x-*` in some cases) silently break the Arabic layout while leaving French intact — so the bug only appears in production for Arabic users. Trigger on any diff that touches className, on any new component, on any layout change, and any time the user mentions RTL, Arabic, mirroring, or the `/ar/` route.
---

# RTL Check Skill

Arabic renders right-to-left. This repo supports both French (LTR) and Arabic (RTL) from a single codebase using Tailwind's logical properties. Every styling change must work in both directions. This skill catches the class of bugs where French looks fine but Arabic is subtly (or grossly) broken.

---

## The core rule

**Never use directional Tailwind classes in shared components.** Use logical properties.

| ❌ Directional (LTR-only) | ✅ Logical (works in both) |
|---|---|
| `pl-4`, `pr-4` | `ps-4`, `pe-4` |
| `ml-4`, `mr-4` | `ms-4`, `me-4` |
| `text-left`, `text-right` | `text-start`, `text-end` |
| `left-0`, `right-0` | `start-0`, `end-0` |
| `border-l`, `border-r` | `border-s`, `border-e` |
| `border-l-2`, `border-r-2` | `border-s-2`, `border-e-2` |
| `rounded-l-md`, `rounded-r-md` | `rounded-s-md`, `rounded-e-md` |
| `-translate-x-4` | `-translate-x-4` (only in flip-agnostic contexts — verify) |
| `space-x-4` | `gap-4` (with `flex`) |
| `justify-start` / `justify-end` | ✅ already logical — safe |
| `float-left`, `float-right` | avoid entirely; use flex |

Legend: `s` = start (left in LTR, right in RTL), `e` = end (right in LTR, left in RTL).

---

## Step 1 — Scan the diff

Before running the dev server, grep the changed files for banned classes:

```bash
# Directional padding/margin
git diff --name-only | xargs grep -nE '\b(pl-|pr-|ml-|mr-)[0-9]+' 2>/dev/null

# Directional text alignment
git diff --name-only | xargs grep -nE 'text-(left|right)\b' 2>/dev/null

# Directional positioning
git diff --name-only | xargs grep -nE '\b(left-|right-)[0-9]+' 2>/dev/null

# Directional borders and radii
git diff --name-only | xargs grep -nE '\b(border-l|border-r|rounded-l|rounded-r)' 2>/dev/null

# space-x utilities (they don't mirror predictably)
git diff --name-only | xargs grep -nE '\bspace-x-[0-9]+' 2>/dev/null
```

Any match is a failure. Replace with the logical equivalent from the table above.

**Exception:** third-party components in `components/ui/` (shadcn) may use directional classes internally. That's OK because shadcn respects `dir` from context. Do not "fix" those files unless you can verify the shadcn version doesn't already handle RTL.

---

## Step 2 — Check icons and inline visuals

Icons that convey direction (arrows, chevrons, back buttons) must mirror in RTL. Icons that are symbolic (bell, calendar, star) must not.

**Must mirror in RTL:**
- `ChevronRight` → visually becomes `ChevronLeft` in RTL
- `ArrowRight`, `ArrowLeft`
- Any "next" / "previous" indicator
- Progress bars that fill left-to-right
- Sliders

**Must NOT mirror:**
- Bell, calendar, star, heart, user, gear
- Play button (▶ always means "play")
- Company logos
- Flags
- Numbers and Latin text

For directional icons, use the `rtl:` variant:
```tsx
<ChevronRight className="rtl:rotate-180" />
```

Or, for images that should mirror entirely:
```tsx
<Image className="rtl:-scale-x-100" ... />
```

For icons that should NOT mirror, wrap in `<span dir="ltr">` if they're inside translated text:
```tsx
<span dir="ltr" className="inline-flex items-center gap-2">
  <Play className="size-4" /> {t('watch_demo')}
</span>
```

---

## Step 3 — Check flex direction

`flex-row` and `flex-row-reverse` are directional too. Consider whether the visual order should flip in RTL.

- Header nav: logo on start, nav in center, CTAs on end → use `flex` with `justify-between`. The direction naturally mirrors.
- A "back button + title" row: back arrow should be at the *visual start*. `flex-row` (default) is correct — it mirrors automatically.
- A "price + currency" cluster: usually should stay in visual order (`3 490 MAD` reads left-to-right even in Arabic). Wrap in `<span dir="ltr">`.

**Rule:** if a flex container arranges items that should mirror in RTL, use plain `flex` (row is default). If a flex container has items that should keep their original order regardless of language (like a price + currency), wrap the container in `dir="ltr"`.

---

## Step 4 — Check absolutely-positioned elements

`absolute left-4 top-4` breaks in RTL. Use `absolute start-4 top-4`.

Common places this hides:
- Close buttons on modals/dialogs
- Badges pinned to a corner ("Recommandé" on the Pro pricing card)
- Notification counters
- Decorative background shapes

Grep:
```bash
git diff --name-only | xargs grep -nE 'absolute .*(left-|right-)' 2>/dev/null
```

---

## Step 5 — Check text direction inside mixed content

Some strings mix languages or directions. For example, "Version 2.4.1 disponible" — the number should stay LTR even inside RTL text. Wrap it:

```tsx
<p>{t('version_available_prefix')} <span dir="ltr">{version}</span></p>
```

Common cases:
- Version numbers
- Email addresses, URLs
- Phone numbers (Moroccan format: `+212 6 12 34 56 78`)
- Prices with currency (`3 490 MAD`)
- File names
- Product codes / SKUs

The `<span dir="ltr">` isolates the content from the surrounding RTL context.

---

## Step 6 — Run the visual smoke test

Start the dev server:
```bash
pnpm dev
```

Open both URLs side by side in the browser:
- http://localhost:3000/fr/
- http://localhost:3000/ar/

For every section changed in the diff, verify:

- [ ] Layout mirrors correctly — items that were on the left in FR are on the right in AR.
- [ ] Icons that should mirror have mirrored; icons that shouldn't haven't.
- [ ] Text alignment matches reading direction (starts on the visual start of the container).
- [ ] Padding and margin are symmetric — no elements crammed against the edge on one side and floating on the other.
- [ ] Prices, phone numbers, versions render LTR inside RTL context.
- [ ] Forms: labels align to the start, inputs fill correctly, error messages align with the input.
- [ ] Buttons with icons: icon and label are in the natural reading order.
- [ ] Cards: "recommended" badges appear on the correct visual corner.
- [ ] Sliders / progress bars: fill from the reading start.

Take a side-by-side screenshot of every changed section. Attach to the PR.

---

## Step 7 — Test with a long Arabic string

Arabic strings tend to be shorter or longer than French for the same idea. Test the layout doesn't break:

- Substitute the longest visible Arabic string with a 2x longer version temporarily.
- Verify the layout doesn't overflow, wrap awkwardly, or clip.
- Revert.

Common failure: a button width was set by the French text and the Arabic overflows. Use `min-w-*` or let content size the button.

---

## Common bug patterns and their fixes

### Bug: Padding is asymmetric in RTL
**Cause:** `pl-4` used instead of `ps-4`.
**Fix:** replace with `ps-4`. Add to eslint rule if not already there.

### Bug: Icon points the wrong way in AR
**Cause:** icon used unconditionally, not mirrored.
**Fix:** add `rtl:rotate-180` for arrows/chevrons.

### Bug: A price renders as "MAD 490 3" in AR
**Cause:** the whole string is subject to RTL bidi reordering.
**Fix:** wrap the price in `<span dir="ltr">`.

### Bug: The close button on a dialog is on the wrong side in AR
**Cause:** `absolute right-4` instead of `absolute end-4`.
**Fix:** switch to `end-4`.

### Bug: A card has rounded corners on the wrong side in AR
**Cause:** `rounded-l-lg` / `rounded-r-lg`.
**Fix:** use `rounded-s-lg` / `rounded-e-lg`.

### Bug: Space between flex items doubles up in AR
**Cause:** `space-x-4` mirrors unpredictably.
**Fix:** use `gap-4` on the flex container instead.

### Bug: A tooltip appears on the wrong side of its trigger
**Cause:** absolute positioning with `left` / `right`.
**Fix:** logical positioning with `start` / `end`, or use a positioning library (Radix/Floating UI, which shadcn already uses correctly).

---

## Automation

Add this to `.eslintrc` (or the project's ESLint config) to prevent regressions:

```js
// eslint.config.js — extend with a custom rule or use eslint-plugin-tailwindcss
{
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'JSXAttribute[name.name="className"] Literal[value=/\\b(pl-|pr-|ml-|mr-|text-left|text-right|left-|right-|border-l|border-r|rounded-l|rounded-r|space-x-)\\d/]',
        message: 'Use logical Tailwind properties (ps-, pe-, ms-, me-, text-start, text-end, start-, end-, border-s, border-e, rounded-s, rounded-e, gap-) instead of directional ones. This repo supports RTL (Arabic).'
      }
    ]
  }
}
```

If ESLint hasn't caught a violation, this skill catches it. If this skill hasn't caught a violation, the Lighthouse accessibility audit will flag it eventually — but that's late feedback. Catch it here.

---

## Final gate

Before considering a styling change done:
- [ ] Grep for banned classes — zero matches.
- [ ] Both `/fr/` and `/ar/` render correctly.
- [ ] Screenshots of the changed section in both locales attached to the PR.
- [ ] No `console.warn` or `console.error` in either locale's dev output.
