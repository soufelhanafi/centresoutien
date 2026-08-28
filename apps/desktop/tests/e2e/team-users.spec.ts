import { test, expect, type Page } from '@playwright/test';
import {
  T,
  launch,
  freshUserDataDir,
  completeSetupAndLogin,
  gotoTeamTab,
  openInviteDialog,
  createEmployeeViaForm,
  createEmployeeViaBridge,
  reissueFirstStaff,
  readSetupCode,
  logout,
  gotoRedeem,
  enterSetupCode,
  redeemRecovery,
  loginViaForm,
  VALID_ADMIN,
  type Launched,
  type Locale,
} from './team-users.fixtures';

/**
 * Direct account creation (single-laptop model): the director sets a new user's
 * login username + password, and the employee signs in with them directly — no
 * one-time code, no self-onboarding step. The director can still re-issue a
 * recovery code to reset an existing employee's password.
 *
 * Black-box: the app is driven only through its UI and the public preload bridge.
 * Each test uses a fresh userData dir (fresh encrypted center DB) and runs under
 * both `fr` (LTR) and `ar` (RTL) Playwright projects, so the visual criteria get
 * real RTL coverage.
 */

const locale = () => test.info().project.name as Locale;

// The credentials the director sets for the employee. Meets the password policy:
// >=8 chars, upper+lower+digit.
const EMP_USER = 'fatima.secretaire';
const EMP_FULL_NAME = 'Fatima Zahra';
const EMP_PW = ['Fatima', '2026', '!'].join('');
const EMP_PW2 = ['Fatima', '2027', '?'].join('');

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function bootDirector(loc: Locale): Promise<Page> {
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  await completeSetupAndLogin(live.win, loc);
  return live.win;
}

test('S1 — roster empty state before any employee is created', async () => {
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);
  await gotoTeamTab(win, loc);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(t.dir);
  await expect(win.getByText(t.emptyTitle)).toBeVisible();
  await expect(win.getByText(t.emptyBody)).toBeVisible();
  await expect(win.getByRole('button', { name: t.addEmployee }).first()).toBeVisible();
});

test('S2 — create an employee with director-set credentials → an active roster row (no code)', async () => {
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);
  await gotoTeamTab(win, loc);

  await openInviteDialog(win, loc);
  await createEmployeeViaForm(win, { fullName: EMP_FULL_NAME, username: EMP_USER, password: EMP_PW }, loc);

  // No one-time-code dialog is shown; the account is born active.
  await expect(win.getByText(t.createdToast)).toBeVisible();
  const row = win.getByRole('row', { name: new RegExp(t.roleSecretary) });
  await expect(row).toBeVisible();
  await expect(row.getByText(t.statusActive)).toBeVisible();
  await expect(win.getByRole('row', { name: /directrice/ }).getByText(t.statusActive)).toBeVisible();
});

test('S3 — a username already taken by a live account is rejected at creation', async () => {
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);

  await createEmployeeViaBridge(win, { username: EMP_USER, password: EMP_PW });
  await gotoTeamTab(win, loc);

  await openInviteDialog(win, loc);
  await createEmployeeViaForm(win, { username: EMP_USER, password: EMP_PW }, loc);
  // Rejected with the taken-username code; no success toast.
  await expect(win.getByText(t.usernameAlreadyTaken)).toBeVisible();
});

test('S4 — the employee signs in directly with the director-set credentials', async () => {
  test.setTimeout(60_000);
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);

  await gotoTeamTab(win, loc);
  await openInviteDialog(win, loc);
  await createEmployeeViaForm(win, { fullName: EMP_FULL_NAME, username: EMP_USER, password: EMP_PW }, loc);
  await expect(win.getByText(t.createdToast)).toBeVisible();

  await logout(win, loc);
  await loginViaForm(win, EMP_USER, EMP_PW, loc);
  await expect(win.getByRole('button', { name: t.logout })).toBeVisible();
  await expect(win.getByText('Centre principal').first()).toBeVisible();
});

test('S5 — a garbage recovery code fails at step 1 (setup-code-invalid)', async () => {
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);
  await createEmployeeViaBridge(win, { username: EMP_USER, password: EMP_PW });

  await logout(win, loc);
  await gotoRedeem(win, loc);
  expect(await win.evaluate(() => document.documentElement.dir)).toBe(t.dir);
  await enterSetupCode(win, 'WRON-GXXX-0000', loc);

  await expect(win.getByText(t.setupCodeInvalid)).toBeVisible();
  await expect(win.getByRole('heading', { name: t.loginTitle })).toHaveCount(0);
});

test('S6 — director re-issues a recovery code; the employee resets their password and signs in', async () => {
  test.setTimeout(90_000);
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);

  // Create the active employee, then the director re-issues a recovery code.
  await gotoTeamTab(win, loc);
  await openInviteDialog(win, loc);
  await createEmployeeViaForm(win, { fullName: EMP_FULL_NAME, username: EMP_USER, password: EMP_PW }, loc);
  await expect(win.getByText(t.createdToast)).toBeVisible();
  await reissueFirstStaff(win, loc);
  const code = await readSetupCode(win);
  await win.getByRole('button', { name: t.setupCodeDone }).click();
  await logout(win, loc);

  // The employee recovers: after the code, a new-password-only step (identity is
  // already on file), then they sign in with the new password.
  await gotoRedeem(win, loc);
  await enterSetupCode(win, code, loc);
  await expect(win.getByText(t.recoveryHint)).toBeVisible();
  await expect(win.locator('input[name="fullName"]')).toHaveCount(0);
  await redeemRecovery(win, { setupCode: code, newPassword: EMP_PW2 }, loc);
  await expect(win.getByText(t.setupSuccess).first()).toBeVisible();

  await loginViaForm(win, EMP_USER, EMP_PW2, loc);
  await expect(win.getByText('Centre principal').first()).toBeVisible();

  // The consumed recovery code no longer resolves.
  await logout(win, loc);
  await loginViaForm(win, VALID_ADMIN.username, VALID_ADMIN.password, loc);
  await logout(win, loc);
  await gotoRedeem(win, loc);
  await enterSetupCode(win, code, loc);
  await expect(win.getByText(t.setupCodeInvalid)).toBeVisible();
});
