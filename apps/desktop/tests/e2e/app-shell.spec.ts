import { test, expect, type Page } from '@playwright/test';
import { STR, boot, type Launched, type Locale } from './app-shell.fixtures';

/**
 * SOU-99 — App shell: sidebar navigation, plan-gated entries. Black-box,
 * driven through the running packaged app only. Runs under both the `fr`
 * and `ar` Playwright projects.
 *
 * Critical-only per SOU-142: this is the canonical plan-lock E2E for the
 * whole app — one proof that the lock mechanism works end-to-end. Per-feature
 * gating correctness is a domain unit test (PlanPolicy) + a component test
 * (useFeature). Do not add a lock-verification E2E per gated feature.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

/** Wait for the shell nav to be mounted. */
async function waitForShell(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await expect(win.getByRole('navigation', { name: L.navAria })).toBeVisible();
  await expect(win.getByRole('heading', { level: 1, name: L.dashboardHeading })).toBeVisible();
}

// ---------------------------------------------------------------------------
// Scenario 6 — a locked entry shows an upgrade affordance and never navigates.
// ---------------------------------------------------------------------------
test('Scenario 6 — locked entry is inert (no navigation) and shows the upgrade affordance', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'essentiel');
  const win = live.win;
  await waitForShell(win, L);
  const nav = win.getByRole('navigation', { name: L.navAria });

  const payroll = nav.getByRole('button').filter({ hasText: L.nav.payroll });
  await expect(payroll).toHaveAttribute('aria-disabled', 'true');
  await expect(payroll).toHaveAttribute('title', L.lockedTitle);
  // Plan badge present (PRO for a Pro-gated entry).
  await expect(payroll.getByText('PRO', { exact: true })).toBeVisible();

  const hashBefore = await win.evaluate(() => location.hash);
  await payroll.click({ force: true });
  // Still on the dashboard route; the disabled entry did not navigate.
  expect(await win.evaluate(() => location.hash)).toBe(hashBefore);
  await expect(win.getByRole('heading', { level: 1, name: L.dashboardHeading })).toBeVisible();
});
