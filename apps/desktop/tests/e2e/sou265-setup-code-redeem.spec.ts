import { test, expect } from '@playwright/test';
import {
  T,
  gotoTeamTab,
  openInviteDialog,
  createEmployeeViaForm,
  reissueFirstStaff,
  readSetupCode,
  logout,
  gotoRedeem,
  enterSetupCode,
  redeemRecovery,
  loginViaForm,
} from './team-users.fixtures';
import { locale, EMP_USER, EMP_PW, createLiveAppHarness } from './sou265.fixtures';

/**
 * SOU-265 — the unauthenticated recovery redeem stays open. The redeem flow runs
 * from the login screen with NO authenticated principal; it must NOT be caught by
 * the new owner/admin role guard. Create an employee (owner), re-issue a recovery
 * code, log out, recover from the login screen, and confirm the new sign-in.
 */

const app = createLiveAppHarness();

const NEW_PW = ['Fatima', '2027', '?'].join('');

test('S4 — unauthenticated recovery redeem stays open (not caught by the role guard)', async () => {
  test.setTimeout(60_000);
  const loc = locale();
  const t = T[loc];
  const win = await app.bootDirector(loc);

  await gotoTeamTab(win, loc);
  await openInviteDialog(win, loc);
  await createEmployeeViaForm(win, { username: EMP_USER, password: EMP_PW }, loc);
  await expect(win.getByText(t.createdToast)).toBeVisible();

  await reissueFirstStaff(win, loc);
  const code = await readSetupCode(win);
  await win.getByRole('button', { name: t.setupCodeDone }).click();

  await logout(win, loc);
  await gotoRedeem(win, loc);
  await enterSetupCode(win, code, loc);
  await expect(win.getByText(t.recoveryHint)).toBeVisible();
  await redeemRecovery(win, { newPassword: NEW_PW }, loc);

  await expect(win.getByText(t.setupSuccess).first()).toBeVisible();
  await expect(win.getByRole('heading', { name: t.loginTitle })).toBeVisible();
  await win.screenshot({ path: `test-results/sou265-s4-redeem-${loc}.png` });

  // And the employee can actually sign in with their new password.
  await loginViaForm(win, EMP_USER, NEW_PW, loc);
  await expect(win.getByRole('button', { name: t.logout })).toBeVisible();
  await expect(win.getByText('Centre principal').first()).toBeVisible();
});
