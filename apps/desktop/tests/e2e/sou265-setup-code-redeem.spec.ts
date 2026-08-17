import { test, expect } from '@playwright/test';
import {
  T,
  gotoTeamTab,
  openInviteDialog,
  submitInvite,
  readSetupCode,
  logout,
  gotoRedeem,
  submitRedeem,
  loginViaForm,
} from './team-users.fixtures';
import { locale, EMP_USER, EMP_PW, createLiveAppHarness } from './sou265.fixtures';

/**
 * SOU-265 — first-login setup-code redeem stays open. The redeem flow runs from
 * the login screen with NO authenticated principal; it must NOT be caught by the
 * new owner/admin role guard. Invite an employee (owner), read the code, log out,
 * redeem it from the login screen, and confirm success + first sign-in.
 */

const app = createLiveAppHarness();

test('S4 — first-login redeem stays open (not caught by the role guard)', async () => {
  test.setTimeout(60_000);
  const loc = locale();
  const t = T[loc];
  const win = await app.bootDirector(loc);

  await gotoTeamTab(win, loc);
  await openInviteDialog(win, loc);
  await submitInvite(win, EMP_USER, loc);
  const code = await readSetupCode(win);
  await win.getByRole('button', { name: t.setupCodeDone }).click();

  await logout(win, loc);
  await gotoRedeem(win, loc);
  await submitRedeem(win, { username: EMP_USER, setupCode: code, newPassword: EMP_PW }, loc);

  await expect(win.getByText(t.setupSuccess)).toBeVisible();
  await expect(win.getByRole('heading', { name: t.loginTitle })).toBeVisible();
  await win.screenshot({ path: `test-results/sou265-s4-redeem-${loc}.png` });

  // And the freshly-activated employee can actually sign in with their password.
  await loginViaForm(win, EMP_USER, EMP_PW, loc);
  await expect(win.getByRole('button', { name: t.logout })).toBeVisible();
  await expect(win.getByText('Centre principal').first()).toBeVisible();
});
