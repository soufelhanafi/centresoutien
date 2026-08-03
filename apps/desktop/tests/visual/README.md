# Visual snapshot suite (SOU-146)

Golden-image regression for the renderer, separate from the black-box
functional suite at `../e2e`. That suite proves *behavior*; this one proves
*pixels* — the theme (light/dark, SOU-144) and direction (LTR/RTL, FR/AR)
matrix a per-screen manual QA checklist can't catch a regression in
cheaply or repeatably.

## How it runs (no Electron)

The functional suite launches the packaged Electron app and drives it through
`window.api.invoke`. This suite doesn't need Electron at all: it serves the
already-built renderer bundle (`../../out/renderer`, produced by `pnpm build`)
over a tiny static HTTP server (`scripts/static-server.mjs`) and loads it in a
plain Chromium page. `window.api` is then fully replaced with a deterministic
stub (`support/mock-bridge.ts`) *before* the app's own scripts run, so every
screen renders from fixed, hermetic data — no real dates, no SQLite, no
Electron/native-module startup cost.

This is a deliberate trade-off: it means this suite cannot catch a real
main-process/IPC regression (the functional suite already does that). What it
buys is fast, flake-free, fully-controlled screens — including states (a
forced load error, a specific theme) that are awkward or impossible to force
reliably through the real IPC round-trip in a black-box E2E test.

Theme is forced by seeding the same `localStorage` key
`public/theme-init.js` and `useThemeStore` read (`centre-soutien.theme`)
before the page's own scripts run — CI has no real display OS theme to flip,
so `prefers-color-scheme` is never relied on. Direction follows locale, via
the same `?locale=` query param the real app reads once at boot
(`i18n/config.ts`), exactly like every other locale-driven suite in this repo.

## The key-screens subset

Golden images are expensive to keep green (any deliberate visual change
means re-approving baselines), so this suite deliberately covers **4 screens
x 4 combinations (light/dark x LTR/RTL) = 16 baseline images**, not the ~30
screens in the app. Everything else stays on the per-batch manual/functional
checklist (SOU-109's screen-parity batches, plus each screen's own
`tests/renderer` unit coverage for its loading/empty/error states).

Screens chosen to cover the app's distinct visual archetypes with minimal
overlap — each one stands in for every other screen shaped like it:

| Screen | Why it's here |
|---|---|
| **Dashboard — Basique** (`dashboard-basic.visual.spec.ts`) | The app's landing screen, on every plan. KPI cards, badges, quick actions — a different layout family from every list/detail screen below. |
| **Students list — load error** (`students-list-error.visual.spec.ts`) | The shared `ErrorState` component (`@centresoutien/ui`), which backs every list screen in the app. One golden image here stands in for teachers/parents/subjects/formulas/groups/rooms/invoices/payroll's own error states — only the icon and copy differ per screen, and those are covered by each screen's `tests/renderer` unit test, not pixels. |
| **Student detail — Info tab** (`student-detail.visual.spec.ts`) | The form/detail archetype: bilingual header, tab navigation, definition-list read view — shared shape with teacher/group/invoice detail pages. |
| **Settings — Appearance tab** (`settings-appearance.visual.spec.ts`) | The screen that owns the very dark-mode toggle this suite's theme matrix exercises (SOU-144) — a regression here is the most direct failure this harness could catch. |

Deliberately **not** golden-imaged (covered functionally/manually instead):
the Planning calendar grid (custom CSS Grid, already flagged as a
`component-size-limits`-sensitive area better served by targeted unit tests
than a brittle full-grid pixel diff), the first-run wizard and login screen
(state machines better proven by the functional suite), and every other list
screen's *happy path* (a table of rows is the same archetype as the students
table already implied by the error-state screenshot's page chrome).

## Updating baselines

Baselines live next to each spec, in `specs/<spec-file>.spec.ts-snapshots/`
(Playwright's default location for `toHaveScreenshot`, platform-suffixed) and
are committed — this is a golden-image suite, so the PNGs *are* the
acceptance criteria for what "correct"
looks like, exactly as the ticket requires. After an intentional visual
change, regenerate with:

```bash
pnpm --filter @centresoutien/desktop exec playwright test -c tests/visual/playwright.config.ts --update-snapshots
```

and review the diff like any other reviewed asset.
