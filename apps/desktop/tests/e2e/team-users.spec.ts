import { test, expect, type Page } from '@playwright/test';
import {
  T,
  launch,
  freshUserDataDir,
  completeSetupAndLogin,
  gotoTeamTab,
  openInviteDialog,
  submitInvite,
  reissueFirstStaff,
  readSetupCode,
  logout,
  gotoRedeem,
  enterSetupCode,
  redeemOnboarding,
  loginViaForm,
  VALID_ADMIN,
  type Launched,
  type Locale,
} from './team-users.fixtures';

/**
 * SOU-303 — code-first staff onboarding, director re-issue, and self-recovery.
 * Black-box: the app is driven only through its UI and the public preload bridge.
 * Each test uses a fresh userData dir (fresh encrypted center DB) and runs under
 * both `fr` (LTR) and `ar` (RTL) Playwright projects, so the visual criteria get
 * real RTL coverage.
 */

const locale = () => test.info().project.name as Locale;

// The identity the staff choose for THEMSELVES at redemption (SOU-303) — the
// director never types it. Meets the password policy: >=8 chars, upper+lower+digit.
const EMP_USER = 'fatima.secretaire';
const EMP_FULL_NAME = 'Fatima Zahra';
const EMP_EMAIL = 'fatima@centre.ma';
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

/** Create an invite straight through the public bridge (role only) → its one-time code. */
async function inviteViaBridge(win: Page): Promise<string> {
  return win.evaluate(async () => {
    const api = (window as unknown as {
      api: { invoke: (c: string, r: unknown) => Promise<{ setupCode: string }> };
    }).api;
    const res = await api.invoke('user.create', { role: 'secretary' });
    return res.setupCode;
  });
}

test('S1 — roster empty state before any employee is invited', async () => {
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);
  await gotoTeamTab(win, loc);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(t.dir);
  await expect(win.getByText(t.emptyTitle)).toBeVisible();
  await expect(win.getByText(t.emptyBody)).toBeVisible();
  await expect(win.getByRole('button', { name: t.addEmployee }).first()).toBeVisible();
});

test('S2 — invite (role only): one-time code dialog, then a pending row with no identity yet', async () => {
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);
  await gotoTeamTab(win, loc);

  await openInviteDialog(win, loc);
  await submitInvite(win, loc);

  // One-time code dialog: title, a real code, single-view warning.
  await expect(win.getByRole('heading', { name: t.setupCodeTitle })).toBeVisible();
  const code = await readSetupCode(win);
  expect(code, 'a non-empty setup code is shown').toMatch(/[A-Z0-9-]{6,}/);
  await expect(win.getByText(t.setupCodeWarning)).toBeVisible();

  // Dismiss → roster lists the owner (active) and a pending invite carrying no
  // identity yet (the staff choose it at redemption).
  await win.getByRole('button', { name: t.setupCodeDone }).click();
  const pending = win.getByRole('row', { name: new RegExp(t.roleSecretary) });
  await expect(pending).toBeVisible();
  await expect(pending.getByText(t.pendingName)).toBeVisible();
  await expect(pending.getByText(t.statusPending)).toBeVisible();
  await expect(win.getByRole('row', { name: /directrice/ }).getByText(t.statusActive)).toBeVisible();
});

test('S3 — a username taken by an onboarded staff is rejected at redemption', async () => {
  test.setTimeout(60_000);
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);

  const first = await inviteViaBridge(win);
  const second = await inviteViaBridge(win);
  await logout(win, loc);

  // First staff onboards and claims the username.
  await gotoRedeem(win, loc);
  await redeemOnboarding(
    win,
    { setupCode: first, username: EMP_USER, fullName: EMP_FULL_NAME, email: EMP_EMAIL, newPassword: EMP_PW },
    loc,
  );
  await expect(win.getByText(t.setupSuccess)).toBeVisible();

  // Second staff tries the same username → rejected inline; no success.
  await gotoRedeem(win, loc);
  await redeemOnboarding(
    win,
    { setupCode: second, username: EMP_USER, fullName: 'Autre Nom', email: 'autre@centre.ma', newPassword: EMP_PW },
    loc,
  );
  // Rejected inline; the onboarding form stays open (we did NOT return to login).
  await expect(win.getByText(t.usernameAlreadyTaken)).toBeVisible();
  await expect(win.locator('input[name="username"]')).toBeVisible();
});

test('S4 — redeem happy path: staff set their own identity, then sign in with it', async () => {
  test.setTimeout(60_000);
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);

  await gotoTeamTab(win, loc);
  await openInviteDialog(win, loc);
  await submitInvite(win, loc);
  const code = await readSetupCode(win);
  await win.getByRole('button', { name: t.setupCodeDone }).click();

  await logout(win, loc);
  await gotoRedeem(win, loc);
  await redeemOnboarding(
    win,
    { setupCode: code, username: EMP_USER, fullName: EMP_FULL_NAME, email: EMP_EMAIL, newPassword: EMP_PW },
    loc,
  );

  await expect(win.getByText(t.setupSuccess)).toBeVisible();
  await expect(win.getByRole('heading', { name: t.loginTitle })).toBeVisible();

  await loginViaForm(win, EMP_USER, EMP_PW, loc);
  await expect(win.getByRole('button', { name: t.logout })).toBeVisible();
  await expect(win.getByText('Centre principal').first()).toBeVisible();
});

test('S5 — a garbage code fails at step 1 (setup-code-invalid), before any identity fields', async () => {
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);
  await inviteViaBridge(win);

  await logout(win, loc);
  await gotoRedeem(win, loc);
  expect(await win.evaluate(() => document.documentElement.dir)).toBe(t.dir);
  await enterSetupCode(win, 'WRON-GXXX-0000', loc);

  await expect(win.getByText(t.setupCodeInvalid)).toBeVisible();
  // Still on the code step — identity fields never rendered, not on the login screen.
  await expect(win.locator('input[name="fullName"]')).toHaveCount(0);
  await expect(win.getByRole('heading', { name: t.loginTitle })).toHaveCount(0);
});

test('S6 — a redeemed code no longer resolves (setup-code-invalid on re-entry)', async () => {
  test.setTimeout(60_000);
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);
  const code = await inviteViaBridge(win);

  await logout(win, loc);
  await gotoRedeem(win, loc);
  await redeemOnboarding(
    win,
    { setupCode: code, username: EMP_USER, fullName: EMP_FULL_NAME, email: EMP_EMAIL, newPassword: EMP_PW },
    loc,
  );
  await expect(win.getByText(t.setupSuccess)).toBeVisible();

  // The same code, re-entered, resolves to nothing now — reported as invalid.
  await gotoRedeem(win, loc);
  await enterSetupCode(win, code, loc);
  await expect(win.getByText(t.setupCodeInvalid)).toBeVisible();
});

test('S7 — director re-issues a code; staff recover with a new password (userId preserved)', async () => {
  test.setTimeout(90_000);
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);

  // Onboard the staff.
  await gotoTeamTab(win, loc);
  await openInviteDialog(win, loc);
  await submitInvite(win, loc);
  const code1 = await readSetupCode(win);
  await win.getByRole('button', { name: t.setupCodeDone }).click();
  await logout(win, loc);
  await gotoRedeem(win, loc);
  await redeemOnboarding(
    win,
    { setupCode: code1, username: EMP_USER, fullName: EMP_FULL_NAME, email: EMP_EMAIL, newPassword: EMP_PW },
    loc,
  );
  await expect(win.getByText(t.setupSuccess)).toBeVisible();

  // Director logs back in and re-issues a fresh code for the same account.
  await loginViaForm(win, VALID_ADMIN.username, VALID_ADMIN.password, loc);
  await gotoTeamTab(win, loc);
  await reissueFirstStaff(win, loc);
  const code2 = await readSetupCode(win);
  await win.getByRole('button', { name: t.setupCodeDone }).click();
  await logout(win, loc);

  // Staff recovers: after the code, the re-issued flow shows a new-password-only
  // step (identity already on file), then they sign in with the new password.
  await gotoRedeem(win, loc);
  await enterSetupCode(win, code2, loc);
  await expect(win.getByText(t.recoveryHint)).toBeVisible();
  await expect(win.locator('input[name="fullName"]')).toHaveCount(0);
  await win.locator('input[name="newPassword"]').fill(EMP_PW2);
  await win.locator('input[name="confirmPassword"]').fill(EMP_PW2);
  await win.getByRole('button', { name: t.setupSubmit }).click();
  // `.first()`: this is the SECOND success in the flow (onboarding was the first),
  // and the E2E window runs hidden, where the toast auto-dismiss timer is paused —
  // so the earlier onboarding toast can still be mounted alongside this one. The
  // real proof of recovery is signing in with the new password just below.
  await expect(win.getByText(t.setupSuccess).first()).toBeVisible();

  await loginViaForm(win, EMP_USER, EMP_PW2, loc);
  await expect(win.getByText('Centre principal').first()).toBeVisible();
});
