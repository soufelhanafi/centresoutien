# Mobile Navigation — Design

**Date:** 2026-07-28
**Branch:** `feat/mobile-nav`
**Status:** Approved, ready for implementation plan

## Problem

The header nav (`components/sections/header/header.tsx`) is `hidden` below the `md`
breakpoint, and so are the Télécharger CTA and the FR/ع language toggle (they sit in
a cluster that only becomes visible content on wide screens). Below `md`, mobile
visitors — the majority of the Moroccan director audience — have **no navigation at
all**: no way to reach `#fonctionnalites`, `#tarifs`, `#programme-fondateur`, `#faq`,
`#contact`, no download CTA, and no language switch. This is a launch blocker.

## Goal

Give sub-`md` visitors an accessible hamburger menu that exposes the same five anchor
links, the Télécharger CTA, and the FR/ع toggle, matching the design language and the
repo's rules (logical Tailwind props, all strings via next-intl in FR + AR, WCAG 2.1 AA).

## Design source

The design proof (`html-design/Centre Soutien Landing.dc.html`, mobile 390 header,
~line 800) shows only the **closed** state: a ~28px muted square button with a
three-line icon at the end edge of the header row. The open-menu state is not drawn,
so the panel is designed here within the existing design tokens. Chosen presentation:
a **full-width dropdown panel** that expands directly under the sticky header, over a
scrim that dims the page below.

## Architecture

Keep `Header` a **Server Component**. Add exactly one `'use client'` island.

### Files

- **New:** `components/sections/header/nav-links.ts`
  - Exports the `NAV_LINKS` array (currently inline in `header.tsx`) as the single
    source of nav order, so both the server desktop `<nav>` and the client mobile
    island import the same list. Type: `readonly { key: string; href: string }[]`.
- **New:** `components/sections/header/mobile-nav.tsx` (`'use client'`)
  - The hamburger trigger + the toggled dropdown panel. Uses
    `useTranslations("header")` for all labels (the `NextIntlClientProvider` already
    wraps the tree in the locale layout). Reuses `Button` and the existing
    `LanguageToggle`.
- **Edit:** `components/sections/header/header.tsx`
  - Import `NAV_LINKS` from `nav-links.ts` instead of declaring it inline.
  - Desktop `<nav>` and the CTA/toggle cluster stay exactly as today but become
    `md`-and-up only (the cluster gains `hidden md:flex`; the desktop nav already has
    `hidden md:flex`).
  - Render `<MobileNav />` as the sub-`md` counterpart (`md:hidden`), placed at the
    end edge of the header row.
- **Edit:** `i18n/messages/fr.json` and `i18n/messages/ar.json`
  - Add `header.menu.open` and `header.menu.close`.

### Header row composition

| Breakpoint | Left | End edge |
|---|---|---|
| `< md` | logo + brand | `<MobileNav />` (hamburger → X) |
| `≥ md` | logo + brand | desktop `<nav>` (centered) + CTA/toggle cluster |

On mobile the CTA and language toggle are **not** in the header row — they live inside
the panel, matching the approved mockup.

## `MobileNav` behavior

**Trigger**
- `md:hidden` icon button. `aria-expanded={open}`, `aria-controls="mobile-nav-panel"`,
  accessible name from `header.menu.open` / `header.menu.close` depending on state.
- Icon: lucide `Menu` when closed, `X` when open (decorative, `aria-hidden`).

**Panel** (`id="mobile-nav-panel"`)
- Full-width, absolutely positioned directly under the sticky header, over a scrim
  that covers the page below (`aria-hidden`, closes on click/tap).
- Contents, in order:
  1. The five anchor links from `NAV_LINKS`, each `t(\`nav.${link.key}\`)`, stacked,
     full-width tap targets (≥44px height).
  2. A divider (`border-t border-border`).
  3. Télécharger CTA: `Button variant="primary"`, full width, with the `Download` icon.
  4. The existing `<LanguageToggle />`, reused unchanged.

**Open / close triggers**
- Opens on trigger tap.
- Closes on: trigger tap, any nav link tap, the CTA tap, scrim tap, `Escape`, and
  crossing to `≥ md` (matchMedia listener). A nav link closes the panel and then the
  in-page anchor jump proceeds.

**Accessibility (WCAG 2.1 AA)**
- On open, move focus into the panel (close button or first link); on close, return
  focus to the trigger.
- Keep focus within the open panel (focus stays on panel controls; Tab cycles).
- Lock `<body>` scroll while open; restore on close.
- All controls keyboard-reachable with the visible focus ring already defined in
  `globals.css`. Scrim is not a focus target.

**Motion**
- Short open/close transition (opacity + small translate/height). Gated behind
  `prefers-reduced-motion: reduce` → no transition, instant show/hide.

**RTL**
- Logical Tailwind props only (`ms-*`, `pe-*`, `text-start`, `end-*`). The hamburger
  sits at the end edge via logical placement. The panel is full-width, so no
  directional mirroring is needed; it renders correctly under `dir="rtl"`.

## i18n keys (new)

`fr.json` → `header.menu`:
```json
"menu": { "open": "Ouvrir le menu", "close": "Fermer le menu" }
```
`ar.json` → `header.menu`:
```json
"menu": { "open": "فتح القائمة", "close": "إغلاق القائمة" }
```
All other labels reuse existing keys: `header.nav.*`, `header.cta.download`,
`header.language.*`. No hardcoded strings in JSX.

## Non-goals

- No change to desktop (`≥ md`) header markup or styling beyond gating the CTA cluster
  behind `md`.
- No new dependency. The disclosure is hand-rolled (no Radix / shadcn Sheet), matching
  the hand-authored-primitive convention and the <90 kb initial-JS budget.
- No routing, content, or other-section changes.

## Verification

1. `pnpm lint` — 0 warnings.
2. `pnpm typecheck` — passes.
3. `pnpm build` — passes.
4. Manual smoke at mobile width (~390px), both locales:
   - `/fr`: open, keyboard-tab through links + CTA + toggle, `Escape` closes and
     returns focus to trigger, tapping a link closes the panel and jumps to the
     anchor, scrim tap closes, resize to `≥ md` closes and shows the desktop nav.
   - `/ar`: same, plus hamburger and panel content render correctly under RTL with the
     hamburger at the end (left) edge.

## Rejected alternatives

- **Whole header as a client component** — needless bundle cost; violates
  "Server Components by default / justify every `'use client'`".
- **CSS-only checkbox-hack menu** — zero JS, but cannot deliver focus trap, `Escape`,
  proper `aria-expanded`, or scroll lock; fails the a11y bar. (The language toggle it
  must contain is already a client component regardless.)
