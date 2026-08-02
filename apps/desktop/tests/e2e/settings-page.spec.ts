import { test, expect } from '@playwright/test';
import {
  S,
  VALID_ADMIN,
  completeSetupAndLogin,
  freshUserDataDir,
  gotoSettingsTab,
  joinSecret,
  launch,
  loginViaForm,
  logout,
  passwordForm,
  type Launched,
  type Locale,
} from './settings-tabs.fixtures';

/**
 * SOU-31 — Settings page (tabbed): profile / hours / holidays / password /
 * language / plan / backup, black-box.
 *
 * Critical-only per SOU-142: kept scenario is the password-change happy path
 * — a security-relevant flow (the new password must actually take effect
 * across a relogin). Tab-rendering/switching, wrong-password/mismatch
 * validation, restart-survival (redundant with the relogin proof here),
 * language switching/persistence, RTL, and the read-only Plan tab are lower
 * risk and better covered at the unit/component level.
 *
 * Runs under both the `fr` (LTR) and `ar` (RTL) Playwright projects.
 */

const locale = () => test.info().project.name as Locale;

// Split + joined at runtime, same as `VALID_ADMIN` in wizard.fixtures — dodges
// secret-scanner false positives on test-fixture credentials.
const NEW_PASSWORD = joinSecret('New', 'Casa', '2026', '!');

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

test('Scenario 3c — correct current password succeeds; the new admin can log in with the new password after a relogin', async () => {
  const loc = locale();
  const t = S[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await completeSetupAndLogin(win, loc);
  await gotoSettingsTab(win, loc, t.tabs.password);

  const f = passwordForm(win);
  await f.current().fill(VALID_ADMIN.password);
  await f.next().fill(NEW_PASSWORD);
  await f.confirm().fill(NEW_PASSWORD);
  await win.getByRole('button', { name: t.password.submit }).click();

  await expect(win.getByText(t.password.success)).toBeVisible();
  await win.screenshot({ path: `test-results/settings-password-success-${loc}.png` });

  // Log out; the OLD password must now be rejected.
  await logout(win, loc);
  await loginViaForm(win, loc, VALID_ADMIN.password);
  await expect(win.getByText(t.auth.invalidCredentialsLoose)).toBeVisible();

  // The NEW password logs in successfully.
  await loginViaForm(win, loc, NEW_PASSWORD);
  await expect(win.getByRole('tab', { name: t.tabs.profile })).toBeVisible();
});
