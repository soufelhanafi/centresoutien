# SOU-16 — UI primitives and design system

**Date:** 2026-07-29
**Ticket:** [SOU-16 — React 19 + TS + Vite + Tailwind + shadcn/ui setup](https://linear.app/soufelhanafi/issue/SOU-16/react-19-ts-vite-tailwind-shadcnui-setup)
**Status:** design approved, pending spec review

---

## 1. Goal

Finish the shared UI foundation in `packages/ui` so that every feature ticket
(SOU-25 onward) composes screens from ready-made, RTL-safe, design-accurate
components instead of inventing markup per page.

## 2. Where we are

SOU-16 shipped React 19 + Tailwind v4 + tokens + two primitives (`Button`,
`Dialog`). Its "done when" clause — a smoke page rendering a themed Button and
Dialog — is already satisfied by `apps/desktop/src/renderer/App.tsx`.

What is **not** done is the primitive list the ticket body actually specifies:
Card, Sheet, Tabs, Table, Badge, Select, Command, Calendar, Form, Sonner. Ten of
the twelve are missing.

## 3. What the design review changed

`desktop-design.html` (authoritative per CLAUDE.md §1) contains 22 screens.
Screen `1a` — "Système visuel" — is an explicit design-system sheet.

The finding that reshaped this spec: **this is not stock shadcn**. Installing the
primitives at their defaults would produce something visibly different from the
design. Two concrete consequences:

1. `packages/ui/src/styles/tokens.css` is incomplete and in two places
   contradicts the design. CLAUDE.md describes the tokens as "already codified";
   they cover roughly half of screen `1a`.
2. The design specifies several components shadcn has no equivalent for, all of
   which encode product rules (invoice status, exam-prep separation, plan
   locking) rather than generic UI.

## 4. Architecture

Three layers, built in order. Each depends only on the one below.

```
┌─────────────────────────────────────────────┐
│ Layer 3 — design-system components          │
│   StatusBadge, KindBadge, PlanBadge,        │
│   LockOverlay, EmptyState, DataTable,       │
│   Numeric, BilingualText                    │
├─────────────────────────────────────────────┤
│ Layer 2 — 21 shadcn primitives              │
│   Button, Dialog, Card, Sheet, Tabs, …      │
├─────────────────────────────────────────────┤
│ Layer 1 — design tokens (tokens.css)        │
│   colour roles, fonts, radii, shadows       │
└─────────────────────────────────────────────┘
```

**`packages/ui` stays free of i18n and domain dependencies.** User-facing strings
arrive as props with French defaults — the pattern `DialogContent.closeLabel`
already establishes. This is what lets the future `apps/web` reuse the package
(CLAUDE.md §1).

### 4.1 Alias strategy

The repo has no path aliases today, and `packages/ui` is consumed as raw source
(`exports: "./src/index.ts"`) bundled by the desktop's Vite. Stock shadcn emits
`@/lib/utils`, which would force the desktop build to resolve `@/` into
`packages/ui/src` — burning the `@/` name the renderer will want for itself.

Use a package-scoped alias instead:

| File | Change |
|---|---|
| `packages/ui/components.json` | new — aliases `@ui/components`, `@ui/lib/utils` |
| `packages/ui/tsconfig.json` | `paths: { "@ui/*": ["src/*"] }` |
| `apps/desktop/tsconfig.web.json` | `paths: { "@ui/*": ["../../packages/ui/src/*"] }` |
| `apps/desktop/electron.vite.config.ts` | matching `resolve.alias` on `renderer` |

`button.tsx` and `dialog.tsx` migrate from `../../lib/utils` to `@ui/lib/utils`
so the package is internally consistent. This keeps `shadcn add` working for
future components, which is the reason the CLI approach was chosen.

## 5. Layer 1 — tokens

All values below are read directly from screen `1a` and the dark-variant screens.
Nothing else in the codebase may hard-code a colour (CLAUDE.md §1).

### 5.1 Colour roles

| Role | Light | Dark | Status |
|---|---|---|---|
| Primary | `#0F766E` | `#14B8A6` | dark value currently wrong (`#2dd4bf`) |
| Success · Payée | `#047857` | `#34D399` | missing |
| Warning · Brouillon | `#B45309` | `#FBBF24` | missing |
| Destructive · Conflit | `#B91C1C` | `#F87171` | currently wrong (`#dc2626`/`#ef4444`) |
| Info · Prévue | `#1D4ED8` | `#60A5FA` | missing |
| Muted | `#64748B` | `#94A3B8` | correct |

### 5.2 Badge surfaces

Each semantic role needs a background / foreground / border triple plus a dot
colour, in both themes.

| Role | Light bg / fg / border | Dark bg / fg / border | Dot (light) |
|---|---|---|---|
| success | `#ecfdf5` / `#047857` / `#a7f3d0` | `#052e21` / `#34d399` / `#064e3b` | `#10b981` |
| warning | `#fffbeb` / `#b45309` / `#fde68a` | `#2d2308` / `#fbbf24` / `#453a0c` | `#f59e0b` |
| destructive | `#fef2f2` / `#b91c1c` / `#fecaca` | `#2d0f0f` / `#f87171` / `#4c1414` | `#ef4444` |
| info | `#eff6ff` / `#1d4ed8` / `#bfdbfe` | `#0e1a33` / `#60a5fa` / `#1e3a5f` | `#3b82f6` |
| neutral | `#f1f5f9` / `#64748b` / `#e2e8f0` | — | — |

### 5.3 Typography

| Token | Family | Use |
|---|---|---|
| `--font-sans` | Inter | headings and UI |
| `--font-arabic` | Noto Sans Arabic | Arabic interface and Arabic-script fields |
| `--font-mono` | JetBrains Mono | amounts, counters, tabular dates |

The design states the mono rule explicitly: *"montants, compteurs, dates
tabulaires. Toujours aligné à droite dans les tableaux, LTR comme RTL."*
Numeric table cells stay end-aligned and LTR in **both** directions — see
`Numeric` in §7.

### 5.4 Radii and shadows

Design scale: `6`, `8`, `10`, `14`. Also in use: `12` (surface cards, app
window), `999` (pills), and `4`/`5`/`7` for small chips.

| Token | Value |
|---|---|
| `--shadow-sm` | `0 1px 2px rgba(15,23,42,.06)` |
| `--shadow-md` | `0 12px 30px -12px rgba(15,23,42,.18)` |
| `--shadow-lg` | `0 20px 40px -20px rgba(15,23,42,.15)` |
| `--shadow-overlay` | `0 12px 30px -12px rgba(15,23,42,.25)` |

### 5.5 Plan tiers

| Tier | Background | Foreground |
|---|---|---|
| Essentiel | `#f1f5f9` | `#475569` |
| Pro | `#0F766E` | `#ffffff` |
| Premium | `linear-gradient(135deg,#7e22ce,#a855f7)` | `#ffffff` |

## 6. Layer 2 — the 21 primitives

Installed with `pnpm dlx shadcn@latest add`, then remediated.

| Group | Components |
|---|---|
| Already present (restyle only) | Button, Dialog |
| Ticket's remaining ten | Card, Sheet, Tabs, Table, Badge, Select, Command, Calendar, Form, Sonner |
| Supporting nine | Input, Label, Checkbox, Switch, DropdownMenu, Avatar, Skeleton, Tooltip, Popover |

Sheet reuses the already-installed `@radix-ui/react-dialog`. Card, Badge and
Skeleton need no dependency.

**New dependencies:** nine `@radix-ui/*` packages (tabs, select, checkbox,
switch, dropdown-menu, avatar, tooltip, popover, label), `cmdk`,
`react-day-picker` + `date-fns`, `sonner`, and `react-hook-form` + `zod` +
`@hookform/resolvers`. The last three are already the prescribed stack
(CLAUDE.md §2).

### 6.1 Remediation pass

Applied to every generated file. This is where the CLI approach carries its cost,
so it is a checklist rather than a habit:

1. **Imports** → `@ui/*`.
2. **Direction** → logical properties: `pl-`→`ps-`, `pr-`→`pe-`, `ml-`→`ms-`,
   `text-left`→`text-start`, `border-l`→`border-s`, `space-x-`→`gap-`.
   `packages/config/eslint.rtl.mjs` fails the build on any survivor.
3. **Directional icons** → chevrons and arrows in Select, Command, Calendar and
   DropdownMenu mirror with `rtl:` (CLAUDE.md §8).
4. **Strings** → no hardcoded English. Anything user-facing becomes an optional
   prop with a French default.
5. **TypeScript strict** — stock shadcn does not compile against
   `packages/config/tsconfig.base.json`: `verbatimModuleSyntax` requires
   `import type`, `exactOptionalPropertyTypes` rejects optional-prop spreading,
   and shadcn still emits React 18's `ElementRef` where this repo uses
   `ComponentRef`.
6. **Geometry** → match the design, not shadcn defaults (its Button is radius 8,
   padding 8×16).
7. **Tokens only** — no literal colour may survive.
8. **Export** the component and its prop types from `packages/ui/src/index.ts`.

### 6.2 Calendar locale

`Calendar` is the one primitive that cannot be locale-agnostic. It takes the
date-fns locale object, `dir`, and a `labels` object as props; the renderer
supplies `fr` or `ar-MA`. No i18n dependency enters `packages/ui`.

## 7. Layer 3 — design-system components

These encode product rules and belong in `packages/ui` because `apps/web` will
need them identically.

`Badge` and `Skeleton` are Layer 2 primitives; they appear in the table below
because the design specifies them precisely and their generated defaults will not
match. They are not additional components — Layer 3 is the eight listed in §4.

**Badge composition.** One `Badge` primitive carries the visual variants
(`success | warning | info | destructive | neutral`, `pill | rounded`, optional
dot). `StatusBadge`, `KindBadge` and `PlanBadge` are thin wrappers mapping a
domain value to a variant. This avoids four near-duplicate components and keeps
the styling open for extension, closed for modification (CLAUDE.md §5).

| Component | Spec |
|---|---|
| `Badge` | pill radius 999 or rounded 6; optional 6px dot; 12px/600 |
| `StatusBadge` | `draft`→warning, `paid`→success, `partially-paid`→info, `cancelled`→destructive. Dot always shown. Labels via props |
| `KindBadge` | `regular` → solid teal, radius 6. `exam-prep` → purple `#7e22ce` on `#faf5ff`, **dashed** `#d8b4fe` border, weight 700. Satisfies CLAUDE.md §7's requirement that exam-prep is always visually separable |
| `PlanBadge` | Essentiel / Pro / Premium per §5.5, radius 5, 11px/700, letter-spacing `.04em` |
| `LockOverlay` | Content behind at `opacity .35` + `blur(1px)`; scrim `rgba(255,255,255,.55)` with backdrop blur; centred card radius 10, `--shadow-overlay`, lock icon in primary, title 12.5/700, muted description, CTA. The design calls this *"un seul traitement"* — the single lock treatment |
| `EmptyState` | Card radius 12; 44px icon tile radius 11 on `#f0fdfa`; title 14/700; muted description max-width 300; optional CTA |
| `Skeleton` | Two-tone fade — leading rows `#f1f5f9`, trailing rows `#f8fafc`; height 11, radius 5. Honours `prefers-reduced-motion` (CLAUDE.md §9) |
| `DataTable` | Column proportions from the design (e.g. `1.3fr 1.3fr .8fr 1fr 1fr 120px`); row padding 12×16; `1px solid` divider; header 11px/700 uppercase muted |
| `Numeric` | JetBrains Mono, tabular figures, end-aligned, forced LTR in RTL context |
| `BilingualText` | Renders an Arabic-script value with `dir="rtl"` and `--font-arabic` inside an otherwise LTR page — the design does this for every `nom (FR)` / `الاسم (AR)` pair |

### 7.1 Deliberate deviation: DataTable markup

The design implements tables as CSS grid (`display: grid` with
`grid-template-columns`). Reproducing that literally would ship tabular data
without table semantics, which regresses the WCAG 2.1 AA target in CLAUDE.md §9 —
screen readers lose row/column association.

`DataTable` therefore uses a semantic `<table>` with `table-layout: fixed` and a
`<colgroup>` carrying the design's column proportions. **Rendered appearance is
identical**; only the underlying markup differs. This is a deviation in mechanism,
not in visual design.

### 7.2 Relationship to the merged `PlanLock`

SOU-20 merged `apps/desktop/src/renderer/components/plan-lock.tsx`, an inline
pill. The design's mandated lock treatment is the blur-and-overlay card in
`LockOverlay`.

**Decision: leave `plan-lock.tsx` untouched.** `LockOverlay` ships as a
presentational component in `packages/ui`; reconciling the two is filed as
follow-up work, not folded into this ticket.

## 8. Verification

| Gate | Catches |
|---|---|
| `pnpm lint` | directional Tailwind utilities — the mechanical RTL guard |
| `pnpm typecheck` | strict-mode violations in generated code |
| `pnpm build` | alias resolution across the workspace boundary |
| `pnpm gate` | the repo's ordered pre-merge gate (`scripts/pre-merge-gate.mjs`) |
| Showcase route | that the components actually render |

**Showcase route.** A dev-only route in the renderer mounting all 21 primitives
and all 8 design-system components in both FR-LTR and AR-RTL. Lint checks class
names but never renders anything, and the current smoke page exercises only
Button and Dialog. It also gives SOU-24's E2E suite a stable target, and
satisfies CLAUDE.md §8's "test every new section in both locales".

**Tests.** `packages/ui` is presentation, so no coverage floor applies
(CLAUDE.md §9). Layer 3 components get render smoke tests under
`apps/desktop/tests/renderer/`, consistent with the existing
`plan-gating.test.tsx`. Layer 2 primitives are covered by the showcase route.

## 9. Out of scope

- **The app shell** — sidebar, topbar, ⌘K search, month picker, segmented
  control. Fully spec'd in screen `1b`, but page-level composition belonging to
  later tickets. This work builds the primitives it will need.
- **Feature screens** — Matières, Formules, Groupes, Élèves and the rest are
  SOU-39/47/50/62 and others, and depend on domain entities and repositories
  that do not exist yet.
- **Reconciling `plan-lock.tsx`** — see §7.2.
- **Fonts loading** — wiring Inter / Noto Sans Arabic / JetBrains Mono as
  bundled assets is a separate concern from declaring the tokens. Tokens land
  here; loading follows in the app-shell work.

## 10. Commit sequence

One concern per commit (CLAUDE.md §4.2). The implementation plan at
`docs/superpowers/plans/2026-07-29-sou-16-ui-primitives.md` refines this into
nine tasks, splitting the primitives by group and the design-system components by
concern so each carries its own test cycle:

1. Design tokens
2. `components.json` and the `@ui/*` alias
3. Form and input primitives
4. Overlay primitives
5. Layout and display primitives
6. Status, kind and plan badges
7. LockOverlay and EmptyState
8. DataTable, Numeric and BilingualText
9. Dev-only showcase in FR and AR
