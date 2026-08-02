---
name: e2e-testing
description: Write, structure, and maintain end-to-end tests for the Centre Soutien Electron desktop app using Playwright's `_electron` driver against the packaged application. Use this skill whenever adding a new user-facing flow (first-run setup, login, CRUD screens, calendar scheduling, invoice generation, Excel round-trip, sync, plan-locked screens), whenever changing the shape of an existing flow, whenever fixing a bug reported by a user, and whenever the CI E2E stage flakes. Trigger on phrases like "end-to-end", "e2e", "Playwright", "electron test", "user flow", "smoke test", "regression", "fresh database", "reset prototype", "packaged app", or any change to a page under `apps/desktop/src/renderer/pages/`. Err on the side of triggering — a domain bug hides in a unit test, but a broken flow hides between the tests you have.
---

# E2E Testing — Centre Soutien Desktop

E2E tests exist to prove that the whole system — Electron main, preload, renderer, IPC, SQLite, i18n, RTL, plan gating — works together for a real user flow. They are slow and expensive, so we write **few** of them and make each one count.

---

## Step 1 — Decide whether the change deserves an E2E test

E2E is the most expensive layer we have — each test boots a full Electron app. Write **only critical scenarios**: the happy path, plus edge cases that carry real business risk. Do not attempt exhaustive coverage at this layer — that belongs at unit/integration.

Ship an E2E test if the change:

- Adds or modifies a top-level flow the user actually performs, and no E2E for that flow's happy path exists yet (create a student, schedule a session, generate invoices, mark paid, export PDF, import Excel, sync).
- Touches a hard domain invariant where a regression would be a money, data-loss, or security incident — e.g. `SubjectInUseError`, immutable-formula-after-invoice, `TooManyActiveSubscriptionsError`, `CrossKindEnrollmentError`, no-hard-delete, backup/restore never touching the live DB, account lockout.
- Changes first-run setup, login, or the DB migration path (these cross Electron main/preload/renderer/IPC/SQLite boundaries — nothing lower can catch a break here).
- Fixes a bug that a unit test could not have caught (crossed layer boundaries or involved real IPC).

Do **not** add an E2E test for:

- A domain math change — that's a unit test.
- Form field validation, empty states, list rendering, search/filter behavior — unit or component test.
- A CSS-only change — visual regression (Chromatic, if adopted) or Playwright screenshot at most.
- RTL/LTR mirroring per screen — one dedicated `i18n-rtl-arabic.spec.ts` happy-path run covers the mechanism; do not repeat a direction check in every CRUD spec.
- Plan-gating per feature — one canonical lock-verification E2E (proving the lock mechanism itself works end-to-end) is enough; per-feature gating correctness is a domain unit test (`PlanPolicy.require` throws) plus a component test (`useFeature` hides UI).
- A refactor with no behavior change.

**Current stage (MVP, pre-launch): critical-only.** The E2E suite targets roughly one happy-path spec per top-level flow plus a small number of high-risk invariant checks — not one spec per screen action. This is a deliberate trade-off while the product surface is still moving fast, not a permanent ceiling. Once the app is feature-complete, broaden back toward one E2E per top-level flow (see CLAUDE.md §9) — that expansion is a conscious future decision, not a default to drift back into today.

If you're unsure whether a scenario is "critical enough" for E2E, default to unit/integration and only escalate if it's genuinely cross-layer or high blast-radius.

---

## Step 2 — File layout and naming

```
tests/e2e/
├── fixtures/
│   ├── electron-app.ts       # launches the packaged app with a fresh DB
│   ├── seed.ts               # deterministic seed data helpers
│   └── plans.ts              # runtime plan overrides for the launched app
├── first-run.spec.ts
├── login.spec.ts
├── students-crud.spec.ts
├── teachers-availability.spec.ts
├── rooms-crud.spec.ts
├── groups-enrollments.spec.ts
├── calendar-week.spec.ts
├── calendar-conflicts.spec.ts
├── calendar-auto-plan.spec.ts   # Pro+ only
├── invoices-generate-and-pay.spec.ts
├── invoices-partial-payment.spec.ts
├── invoice-template.spec.ts
├── invoice-pdf-export.spec.ts
├── excel-export.spec.ts
├── excel-import-preview-apply.spec.ts
├── excel-sync.spec.ts           # Pro+ only
├── plan-lock-essentiel.spec.ts  # runs the app on essentiel, proves locks
├── parents-crud.spec.ts
├── i18n-rtl-arabic.spec.ts      # runs a full happy path in AR
└── settings-danger-zone.spec.ts
```

One spec = one flow. Do not batch unrelated scenarios into one file "for speed" — flakiness cost outweighs it.

---

## Step 3 — Launch the packaged app with a fresh, deterministic DB

Every spec starts from a **known state**. The launcher fixture:

1. Builds the app if the build artifact is missing (CI caches this).
2. Points `userData` to a fresh temp dir.
3. Optionally seeds the DB by running SQL directly against the temp DB before the app starts.
4. Overrides the active plan via a `--plan=` CLI flag or an environment variable read by `composition-root.ts` (dev/test only).
5. Sets `LANG_OVERRIDE=fr` or `ar` to force the initial locale.

```ts
// tests/e2e/fixtures/electron-app.ts
import { _electron as electron, expect, test as base } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { seed as writeSeed } from './seed';

type LaunchOptions = {
  plan?: 'essentiel' | 'pro' | 'premium';
  locale?: 'fr' | 'ar';
  seed?: Parameters<typeof writeSeed>[1];
};

export const test = base.extend<{ launch: (opts?: LaunchOptions) => Promise<ReturnType<typeof electron.launch>> }>({
  launch: async ({}, use) => {
    const launched: any[] = [];
    await use(async (opts = {}) => {
      const userData = await fs.mkdtemp(path.join(await fs.realpath(require('os').tmpdir()), 'centresoutien-e2e-'));
      if (opts.seed) await writeSeed(userData, opts.seed);
      const app = await electron.launch({
        args: [
          path.resolve(__dirname, '../../out/main/index.js'),
          `--user-data=${userData}`,
          `--plan=${opts.plan ?? 'premium'}`,
          `--locale=${opts.locale ?? 'fr'}`,
        ],
        env: { ...process.env, CENTRE_SOUTIEN_TEST: '1' },
      });
      launched.push({ app, userData });
      return app;
    });
    for (const { app, userData } of launched) {
      await app.close();
      await fs.rm(userData, { recursive: true, force: true });
    }
  },
});
```

Rules:

- Never share a temp directory between specs.
- Never rely on a previous spec having created data.
- Never touch the real user's home directory.

---

## Step 4 — Write a spec around user intent, not around clicks

Structure each spec as: **arrange (seed) → act (drive UI) → assert (visible outcome) → cleanup (auto)**.

Prefer accessible queries: `getByRole`, `getByLabel`, `getByText`. Do not query by CSS class. Test IDs (`data-testid`) are permitted only when there is no accessible name — and the fix is usually to add the accessible name.

```ts
import { test } from './fixtures/electron-app';
import { expect } from '@playwright/test';

test('creates a student, enrolls them in a group, generates an invoice, marks it paid', async ({ launch }) => {
  const app = await launch({
    plan: 'pro',
    locale: 'fr',
    seed: { center: 'CS-CASA-001', groups: [{ name: '2nde Bac Math', fee: 500 }] },
  });
  const page = await app.firstWindow();
  await page.getByLabel('Mot de passe').fill('demo');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  // Create student
  await page.getByRole('link', { name: 'Élèves' }).click();
  await page.getByRole('button', { name: 'Nouvel élève' }).click();
  await page.getByLabel('Nom complet').fill('Ahmed Benali');
  await page.getByLabel('Téléphone').fill('+212600000000');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('row', { name: /Ahmed Benali/ })).toBeVisible();

  // Enroll
  await page.getByRole('row', { name: /Ahmed Benali/ }).click();
  await page.getByRole('tab', { name: 'Groupes' }).click();
  await page.getByRole('button', { name: 'Inscrire à un groupe' }).click();
  await page.getByRole('option', { name: '2nde Bac Math' }).click();
  await page.getByRole('button', { name: 'Confirmer' }).click();

  // Generate invoices
  await page.getByRole('link', { name: 'Paiements' }).click();
  await page.getByRole('button', { name: /Générer les factures/i }).click();
  await page.getByRole('button', { name: 'Confirmer' }).click();

  // Mark paid
  await page.getByRole('row', { name: /Ahmed Benali/ }).click();
  await page.getByRole('button', { name: 'Marquer payée' }).click();
  await expect(page.getByText(/Payée/)).toBeVisible();
});
```

---

## Step 5 — Test plan gating end-to-end (once, canonically)

Do not add a lock-verification E2E per gated feature. One canonical spec proves the lock mechanism works (inert nav entry, disabled control, upgrade affordance) — that's enough to catch a broken gate across the whole app. Per-feature entitlement correctness is a domain unit test on `PlanPolicy`, not an E2E concern.

Parameterized form, if you do need to check the mechanism across plans:

```ts
for (const plan of ['essentiel', 'pro', 'premium'] as const) {
  test(`Auto-planning is ${plan === 'essentiel' ? 'locked' : 'available'} on ${plan}`, async ({ launch }) => {
    const app = await launch({ plan });
    const page = await app.firstWindow();
    await page.getByRole('link', { name: 'Calendrier' }).click();
    const autoPlanButton = page.getByRole('button', { name: /planification aléatoire/i });
    if (plan === 'essentiel') {
      await expect(autoPlanButton).toBeDisabled();
      await autoPlanButton.hover();
      await expect(page.getByText(/Passer à Pro/)).toBeVisible();
    } else {
      await autoPlanButton.click();
      await expect(page.getByRole('dialog', { name: /planification/i })).toBeVisible();
    }
  });
}
```

One lock-verification E2E covers the mechanism for the whole app — not one per gated feature.

---

## Step 6 — Run at least one full flow in Arabic (RTL)

The `i18n-rtl-arabic.spec.ts` runs a happy path start-to-finish in Arabic. It asserts:

- The layout is RTL: `await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');`
- Sidebar navigation still works.
- Number columns are still right-aligned in the LTR-numerical sense (monospace, but numeric formatting matches AR locale).
- Directional icons are mirrored (assert an SVG transform or a specific class if reliable).

RTL bugs almost never surface in unit tests. This spec is our safety net.

---

## Step 7 — PDF and Excel round-trip

For PDF export, click "Exporter PDF", grab the file dialog's target path via a fake save handler (or set a known download dir), then assert:

- The file exists and is > 1 KB.
- It's a valid PDF (starts with `%PDF-`).
- If pixel-comparison is worthwhile, take a screenshot of the first page via `pdf-lib` in the test and compare to a snapshot.

For Excel round-trip:

- Export a template.
- Modify it programmatically with `exceljs`.
- Import it via the UI.
- Assert the preview shows the expected `created / updated / skipped` counts.
- Apply.
- Assert the target screen reflects the change.

---

## Step 8 — Reliability rules

- **No `waitForTimeout`.** Ever. Wait for an assertion or a network/IPC condition.
- **Auto-wait through `expect`.** `await expect(locator).toBeVisible()` handles timing.
- **Isolate.** Each test creates its own temp DB, its own window, its own everything.
- **Small test data.** Seed the minimum needed to exercise the flow. A student and one group is enough for invoicing; ten students hides bugs behind noise.
- **Retries in CI only.** `retries: process.env.CI ? 2 : 0`. Local flakiness is a bug — hunt it down.
- **Randomize order in nightly CI.** Catches shared-state bugs.
- **Video and trace on failure.** `use: { video: 'retain-on-failure', trace: 'retain-on-failure' }` — non-negotiable, the failure log is priceless.

---

## Step 9 — Running the suite

```bash
pnpm build                    # required — E2E runs against the built artifacts
pnpm test:e2e                 # all specs
pnpm test:e2e -- --grep "invoice"   # subset
pnpm test:e2e --headed        # local debugging with a visible window
pnpm test:e2e --ui            # Playwright UI mode
pnpm test:e2e:report          # opens the last HTML report
```

CI runs after unit + integration + build succeed. If any earlier stage fails, E2E is skipped.

---

## Step 10 — Debugging a flaky E2E

Flakiness is a bug. Before disabling a test:

1. Reproduce locally with `--repeat-each=10`.
2. Open the trace viewer on a failed run.
3. Common causes:
   - Race between IPC response and next assertion → use `expect` with auto-wait, or wait on a specific IPC-driven state.
   - Shared temp path (two runs collided) → check the fixture.
   - Non-deterministic seed order → sort the seeded rows.
   - Time-of-day dependency (month rollover) → freeze the clock via the seed's `now` field.
4. Fix the cause. Never `test.skip()` past a flake.

---

## Common mistakes and their fix

| Mistake | Fix |
|---|---|
| `page.locator('.btn-primary').click()` | Use `getByRole('button', { name: /.../i })`. |
| `await page.waitForTimeout(500)` | Wait on an assertion or an IPC state. |
| One spec asserting six unrelated flows | Split into six specs, each starting from a fresh DB. |
| A spec that only runs on developer machines because it needs a fixture file at `~/Downloads` | Ship the fixture in the repo under `tests/e2e/fixtures/`. |
| A spec that fails on the first of the month | Freeze the clock via the app's test-mode CLI flag. |
| A spec that only tests FR | Verify the same flow in AR at least in the dedicated RTL spec. |
