import { test, expect } from '@playwright/test';
import {
  T,
  launch,
  freshUserDataDir,
  completeSetupAndLogin,
  gotoTeamTab,
  openInviteDialog,
  submitInvite,
  readSetupCode,
  logout,
  loginViaForm,
  VALID_ADMIN,
} from './team-users.fixtures';
import { AUTH } from './login.fixtures';
import { locale, EMP_USER, createLiveAppHarness } from './sou265.fixtures';

/**
 * SOU-265 — remember-me principal survives an app restart. Log in through the UI
 * with "remember this device", close the app, relaunch the SAME userData dir:
 * still authenticated (no login screen) and the director can STILL invite. If the
 * persisted principal were lost, the new role guard would wrongly block the
 * director at `user.create`. Cross-process persistence proof.
 */

const app = createLiveAppHarness();

test('S2 — remembered principal survives restart; director can still invite [DONE-WHEN]', async () => {
  test.setTimeout(60_000);
  const loc = locale();
  const t = T[loc];
  const a = AUTH[loc];
  const dir = freshUserDataDir();

  // Fresh center: create admin + center via the wizard, then land on the shell.
  app.set(await launch({ locale: loc, plan: 'pro', userDataDir: dir }));
  let win = app.get()!.win;
  await completeSetupAndLogin(win, loc);

  // Log out, then log back in through the real UI form WITH remember-me ticked.
  await logout(win, loc);
  await win.getByText(a.rememberDevice).click();
  await expect(win.getByRole('checkbox')).toBeChecked();
  await loginViaForm(win, VALID_ADMIN.username, VALID_ADMIN.password, loc);
  await expect(win.getByRole('button', { name: t.logout })).toBeVisible();

  // Restart: close and relaunch the SAME userData dir (same encrypted center DB).
  await app.get()!.app.close();
  app.set(await launch({ locale: loc, plan: 'pro', userDataDir: dir }));
  win = app.get()!.win;

  // Still authenticated straight to the app — no login screen.
  await expect(win.getByRole('button', { name: t.logout })).toBeVisible();
  await expect(win.getByRole('heading', { name: t.loginTitle })).toHaveCount(0);
  await win.screenshot({ path: `test-results/sou265-s2-after-restart-${loc}.png` });

  // The recovered director principal still clears the owner/admin role guard.
  await gotoTeamTab(win, loc);
  await openInviteDialog(win, loc);
  await submitInvite(win, EMP_USER, loc);
  await expect(win.getByRole('heading', { name: t.setupCodeTitle })).toBeVisible();
  const code = await readSetupCode(win);
  expect(code, 'director can still mint an invite after the restart').toMatch(/[A-Z0-9-]{6,}/);
});
