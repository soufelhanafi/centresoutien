import { test, expect, type Page } from '@playwright/test';
import { STR, DIRECTION, boot, type Launched, type Locale } from './app-shell.fixtures';

/**
 * SOU-112 — Router not-found boundary. Gated modules (payroll, sync) already
 * self-gate with `LockOverlay` at the page level; a direct hash to a known,
 * gated route renders that lock card rather than being redirected away, so
 * there is nothing route-level to test here beyond truly unknown hashes.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function waitForShell(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await expect(win.getByRole('navigation', { name: L.navAria })).toBeVisible();
  await expect(win.getByRole('heading', { level: 1, name: L.dashboardHeading })).toBeVisible();
}

async function navigateToHash(win: Page, hash: string): Promise<void> {
  await win.evaluate((h) => {
    window.location.hash = h;
  }, hash);
}

test('unknown hash route (#/does-not-exist) redirects to the default route', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'essentiel');
  const win = live.win;
  await waitForShell(win, L);

  await navigateToHash(win, '#/does-not-exist');
  await expect(win.getByRole('heading', { level: 1, name: L.dashboardHeading })).toBeVisible();
  expect(await win.evaluate(() => location.hash)).toBe('#/dashboard');
  await expect(win.locator('html')).toHaveAttribute('dir', DIRECTION[locale()]);

  const bodyText = await win.evaluate(() => document.body.innerText.trim());
  expect(bodyText.length, 'must not render a blank page').toBeGreaterThan(0);
});

test('malformed/URI-encoded hashes redirect to the default route without crashing', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'essentiel');
  const win = live.win;
  await waitForShell(win, L);

  for (const hash of ['#/%', '#/students/%', '#/%zz', '#/settings/%E0%A4%A', '#/planning/%c0']) {
    await navigateToHash(win, hash);
    await expect(win.getByRole('heading', { level: 1, name: L.dashboardHeading })).toBeVisible();
  }
});
