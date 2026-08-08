import { test, expect } from '@playwright/test';
import { STR, bootWithClash, type Launched, type Locale } from './sync-conflicts.fixtures';

/**
 * SOU-84 — Enforce feature gates across UI + repos (black-box functional QA).
 *
 * KICKOFF DECISION: gating is proven against an under-provisioned plan by
 * DROPPING the `sync.multi-device` flag, NOT by picking a plan id — the shipped
 * MVP tiers (SOU-83) grant that flag to essentiel / pro / premium alike.
 *
 * Consequently the NEGATIVE path (a plan LACKING `sync.multi-device` renders the
 * full-page plan gate, hides the nav entry, and the use case throws
 * `PlanFeatureUnavailableError`) is NOT reachable through the packaged app's
 * launch seam: `CS_PLAN` / `E2eSyntheticLicense` only select a whole tier, and
 * every tier includes `sync.multi-device`. There is no e2e feature-drop knob.
 * That branch is instead proven at the component + domain layer:
 *   - apps/desktop/tests/renderer/sync/sync-page.test.tsx (full-page gate, FR+AR)
 *   - packages/domain plan-lock unit tests (use-case safety net)
 * which is the sanctioned split per CLAUDE.md §9.
 *
 * What IS black-box provable here (the shipped reality, flag PRESENT): the
 * Synchronisation entry is a live nav link and the page renders the WORKING sync
 * surface — never the full-page plan gate. This is the regression guard that the
 * gate is not falsely triggered on plans that DO include the flag.
 */

const locale = () => test.info().project.name as Locale;

/** `plan.locked` — the full-page gate title, mirrored from i18n {fr,ar}.json. */
const GATE_TITLE: Record<Locale, string> = {
  fr: 'Réservé à un plan supérieur',
  ar: 'غير متاح في خطتك',
};

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

for (const plan of ['essentiel', 'premium'] as const) {
  test(`${plan} plan grants sync.multi-device — Synchronisation renders the working page, not the plan gate`, async () => {
    const L = STR[locale()];
    live = await bootWithClash(locale(), plan, false);
    const win = live.win;

    const nav = win.getByRole('navigation', { name: L.navAria });
    const link = nav.getByRole('link', { name: L.nav, exact: true });
    await expect(link).toBeVisible();
    await link.click();

    await expect(win.getByRole('heading', { name: L.title }).first()).toBeVisible();
    await expect(win.getByText(L.subtitle)).toBeVisible();
    await expect(win.getByText(GATE_TITLE[locale()])).toHaveCount(0);
    await expect(win.locator('html')).toHaveAttribute('dir', L.dir);
  });
}
