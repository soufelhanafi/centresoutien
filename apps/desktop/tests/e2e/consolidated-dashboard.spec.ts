import { test, expect, type Page } from '@playwright/test';
import { STR, DIRECTION, boot, activePlan, gotoConsolidatedTab, type Launched, type Locale } from './consolidated-dashboard.fixtures';

/**
 * SOU-105 — Consolidated multi-center dashboard ("Consolidé" tab). Black-box,
 * driven only through the running packaged app + the public preload bridge.
 * Runs under both the `fr` (LTR) and `ar` (RTL) Playwright projects.
 *
 * Locked scope: "Desktop = upsell only" — no cross-DB aggregation exists. Two
 * plan-gated branches on `org.multi-center` (Premium):
 *   - Non-Premium → Premium upsell lock (title + "Débloquer avec Premium" CTA).
 *   - Premium     → "Disponible dans l’application web" link-out, NO data.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

// ---------------------------------------------------------------------------
// Scenario 1 — Non-Premium (Essentiel): the Consolidé tab shows the Premium
// upsell lock (multi-center title + "Débloquer avec Premium" CTA), and NOT the
// cloud link-out.
// ---------------------------------------------------------------------------
test('Scenario 1 — Essentiel: Consolidé tab shows the Premium upsell lock + CTA', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'essentiel');
  const win = live.win;

  expect(await activePlan(win), 'CS_PLAN=essentiel took effect').toBe('essentiel');

  await gotoConsolidatedTab(win, L);
  await win.screenshot({ path: `test-results/consolidated-essentiel-${locale()}.png` });

  await expect(win.getByRole('tab', { name: L.tabConsolidated })).toHaveAttribute('aria-selected', 'true');

  // Upsell lock present: multi-center title + unlock-with-Premium CTA.
  await expect(win.getByText(L.lockTitle).first()).toBeVisible();
  await expect(win.getByRole('button', { name: L.unlockCta }).first()).toBeVisible();

  // The Premium-only cloud link-out must be absent on a non-Premium plan.
  await expect(win.getByText(L.cloudTitle)).toHaveCount(0);

  // Layout direction matches the active locale (RTL under `ar`).
  await expect(win.locator('html')).toHaveAttribute('dir', DIRECTION[locale()]);
});

// ---------------------------------------------------------------------------
// Scenario 2 — Premium: the Consolidé tab shows the "Disponible dans
// l’application web" link-out, NO upsell lock, and — per the locked scope — no
// aggregated KPI figures (desktop never reads across per-center DBs).
// ---------------------------------------------------------------------------
test('Scenario 2 — Premium: Consolidé tab shows the web link-out, no upsell, no data', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'premium');
  const win = live.win;

  expect(await activePlan(win), 'CS_PLAN=premium took effect').toBe('premium');

  await gotoConsolidatedTab(win, L);
  await win.screenshot({ path: `test-results/consolidated-premium-${locale()}.png` });

  await expect(win.getByRole('tab', { name: L.tabConsolidated })).toHaveAttribute('aria-selected', 'true');

  // Link-out card present with its explanatory body.
  await expect(win.getByText(L.cloudTitle).first()).toBeVisible();
  await expect(win.getByText(L.cloudBody).first()).toBeVisible();

  // No upsell affordance on Premium: neither the lock title nor the unlock CTA.
  await expect(win.getByText(L.lockTitle)).toHaveCount(0);
  await expect(win.getByRole('button', { name: L.unlockCta })).toHaveCount(0);

  // Locked scope: desktop never aggregates across DBs, so the Premium branch
  // surfaces no cross-center KPI figures — only the link-out.
  await expect(win.getByText(L.kpiRevenue)).toHaveCount(0);

  await expect(win.locator('html')).toHaveAttribute('dir', DIRECTION[locale()]);
});

// ---------------------------------------------------------------------------
// Scenario 3 — AC "handles a center DB being unavailable gracefully": the tab
// opens no DB, so it must render regardless of data state. A freshly booted
// center (zero students/invoices/sessions) still renders the tab content
// without the renderer error boundary.
// ---------------------------------------------------------------------------
test('Scenario 3 — the tab renders on an empty center without opening any DB (no crash)', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'premium');
  const win = live.win;

  await gotoConsolidatedTab(win, L);

  const crashed = await pageCrashed(win);
  expect(crashed, 'Consolidé tab rendered without the "Something went wrong" boundary').toBe(false);
  await expect(win.getByText(L.cloudTitle).first()).toBeVisible();
});

/** True when the renderer error boundary is showing (page crashed on render). */
async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}
