import { expect, test } from '@playwright/test';
import { D, boot, bootLoggedOut, forceCloseApp, type Launched, type Locale } from './demo-mode.fixtures';

/**
 * Demo mode — UI entry points (Settings "Mode démo" tab + login "Explorer la
 * démo"). Black-box: driven through the running packaged app and the DOM only.
 * Runs under both `fr` (LTR) and `ar` (RTL) Playwright projects.
 *
 * SOU-186 turned demo mode into an in-process hot-swap (no `app.relaunch`, no
 * window reload). The relaunch-based scenarios that used to live here (create →
 * relaunch → `--demo` → status) asserted the removed restart contract and are
 * superseded by `demo-hot-swap.spec.ts` (HS1–HS5), which exercises the swap in a
 * single live process/window. Only the entry-point render checks remain here.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await forceCloseApp(live?.app ?? undefined);
  live = null;
});

test('S5a — Settings renders the "Mode démo" tab with create/wipe copy (FR/AR)', async () => {
  const loc = locale();
  const t = D[loc];
  live = await boot(loc);
  await live.win.getByRole('link', { name: t.settingsNav, exact: true }).click();
  await live.win.getByRole('tab', { name: t.demoTab, exact: true }).click();
  const panel = live.win.getByRole('tabpanel');
  await expect(panel.getByText(t.introSubtitle, { exact: false })).toBeVisible();
  await expect(panel.getByRole('button', { name: t.createBtn, exact: true })).toBeVisible();
  await live.win.screenshot({ path: `test-results/demo-settings-tab-${loc}.png` });
});

test('S5b — Login screen shows the "Explorer la démo" entry (FR/AR)', async () => {
  const loc = locale();
  const t = D[loc];
  live = await bootLoggedOut(loc);
  const btn = live.win.getByRole('button', { name: t.loginExploreDemo, exact: true });
  await expect(btn).toBeVisible();
  await expect(live.win.getByText(t.loginExploreDemoHint, { exact: false })).toBeVisible();
  await live.win.screenshot({ path: `test-results/demo-login-entry-${loc}.png` });
});
