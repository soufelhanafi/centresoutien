# Design tokens

**Source of truth:** `packages/ui/src/styles/tokens.css`. Exported from the
package as `@centresoutien/ui/styles/tokens.css` (see `packages/ui/package.json`
`exports`), imported by `apps/desktop/src/renderer/globals.css` after
`@import "tailwindcss"`. Raw custom properties in `:root` / `.dark`, mapped
onto Tailwind v4 utility scales via `@theme inline`.

**Current consumers:** `apps/desktop` only.

**Pending consumer:** the landing page (centresoutien.com). It still lives in
its own repo (`soutien-scolaire/centresoutien-web`, sibling to this monorepo)
and has not been imported into `apps/landing` yet — see the
`landing-site-consolidation` decision. `apps/landing/` in this repo is an
intentional placeholder. Follow-up: **SOU-138** — import the landing repo
(git-history-preserving) into `apps/landing`, reconfigure Vercel's Root
Directory, and wire its `globals.css` to import `packages/ui/src/styles/tokens.css`
instead of hand-rolling its own `@theme` block.

## Reconciliation checklist for the landing import (SOU-138)

The landing repo's `app/globals.css` currently defines its own `@theme` block
that has drifted from `packages/ui/src/styles/tokens.css`. Diffs to resolve
when wiring the shared source:

- **Naming convention:** landing declares Tailwind theme keys directly
  (`--color-primary: #0f766e`); the shared source declares raw tokens
  (`--primary: #0f766e`) and maps them via a separate `@theme inline` block.
  Landing's CSS must switch to consuming the raw tokens the same way.
- **Destructive color differs:** landing `#ef4444` / `#ffffff` vs. shared
  `#b91c1c` / `#fef2f2`. Needs a product decision on which wins (or whether
  the landing page's marketing-page destructive usage — form errors — can
  just adopt the desktop value).
- **`--color-primary-hover`** exists only in landing (used for button/link
  hover states). Not present in the shared source — add it if the landing
  page still needs a dedicated hover token after import, or replace with
  Tailwind's built-in hover opacity utilities.
- **Landing has no dark mode** (`color-scheme: light` is hard-coded). The
  shared source's `.dark` block would be unused dead weight for landing
  unless/until the landing page adds dark mode support.
- **Landing is missing entirely:** `popover`/`popover-foreground`, `success`/
  `warning`/`info`, all `--badge-*`, `--kind-*` (regular/exam-prep), the
  8-slot `--subject-*` planner palette, `--plan-*` tier colors, `--lock-scrim`,
  `--font-family-mono`, the `--radius-{sm,md,lg,xl,2xl}` scale (landing has a
  single flat `--radius`), and the `--shadow-*` scale. These are desktop-app
  concepts (planner, plan badges, lock overlays) the landing page doesn't
  need — the import should pull only the tokens landing actually uses, not
  blindly merge the entire file.
- **Arabic font variable naming:** landing uses `--font-arabic: var(--font-noto-arabic), ...`
  wired through `next/font`; the shared source uses `--font-family-arabic` as
  a static stack. Landing's `next/font` wiring stays; only the *value*
  should trace back to the shared source where they overlap (e.g. brand
  teal, spacing, radius, typography scale — not the Next-specific font
  variable plumbing).
