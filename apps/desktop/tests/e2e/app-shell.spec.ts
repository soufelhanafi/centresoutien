import { test, expect, type Page } from '@playwright/test';
import { STR, boot, type Launched, type Locale } from './app-shell.fixtures';

/**
 * SOU-99 — App shell: sidebar navigation, plan-gated entries. Black-box,
 * driven through the running packaged app only. Runs under both the `fr`
 * and `ar` Playwright projects.
 *
 * SOU-83 MVP tier collapse: every plan now grants every module flag except
 * `org.multi-center` (which has no desktop surface), so no sidebar entry is
 * locked in-app. This scenario proves the previously Pro-gated payroll entry
 * is now a live, navigating link on Essentiel. Lock-affordance rendering is
 * still covered at the component level (useFeature + LockOverlay) via a
 * synthetic plan that drops the flag.
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
// Scenario 6 — the previously Pro-gated payroll entry is a live link on
// Essentiel and navigates (no lock affordance, no upgrade badge).
// ---------------------------------------------------------------------------
test('Scenario 6 — the payroll entry is unlocked on Essentiel and navigates', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'essentiel');
  const win = live.win;
  await waitForShell(win, L);
  const nav = win.getByRole('navigation', { name: L.navAria });

  const payroll = nav.getByRole('link', { name: L.nav.payroll, exact: true });
  await expect(payroll).toBeVisible();
  await expect(payroll).not.toHaveAttribute('aria-disabled', 'true');
  await expect(nav.getByText('PRO', { exact: true })).toHaveCount(0);

  await payroll.click();
  await win.waitForTimeout(400);
  expect(await win.evaluate(() => location.hash)).toContain('payroll');
});
