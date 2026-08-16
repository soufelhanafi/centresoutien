import { test, expect, type Page } from '@playwright/test';
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
  gotoRedeem,
  submitRedeem,
  loginViaForm,
  type Launched,
  type Locale,
} from './team-users.fixtures';

/**
 * SOU-256 (slice B) — Team/Users management, one-time setup code, and the
 * first-login redeem flow. Black-box: the app is driven only through its UI and
 * the public preload bridge. Each test uses a fresh userData dir (fresh
 * encrypted center DB) and runs under both the `fr` (LTR) and `ar` (RTL)
 * Playwright projects, so the visual criteria get real RTL coverage.
 */

const locale = () => test.info().project.name as Locale;

// Employee credentials assembled at runtime (secret-scan friendly). Meets the
// redeem password policy: >=8 chars, upper + lower + digit.
const EMP_USER = 'fatima.secretaire';
const EMP_PW = ['Fatima', '2026', '!'].join('');

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

/** Create an employee straight through the public bridge and return its one-time code. */
async function inviteViaBridge(win: Page, username: string): Promise<string> {
  return win.evaluate(async (u) => {
    const api = (window as unknown as {
      api: { invoke: (c: string, r: unknown) => Promise<{ setupCode: string }> };
    }).api;
    const res = await api.invoke('user.create', { username: u, role: 'secretary' });
    return res.setupCode;
  }, username);
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

  await win.screenshot({ path: `test-results/sou256-team-empty-${loc}.png` });
});

test('S2 — add employee: one-time setup code dialog, then roster shows a pending row', async () => {
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);
  await gotoTeamTab(win, loc);

  await openInviteDialog(win, loc);
  await submitInvite(win, EMP_USER, loc);

  // One-time code dialog: title, a real code, copy button, single-view warning.
  await expect(win.getByRole('heading', { name: t.setupCodeTitle })).toBeVisible();
  const code = await readSetupCode(win);
  expect(code, 'a non-empty setup code is shown').toMatch(/[A-Z0-9-]{6,}/);
  await expect(win.getByRole('button', { name: t.setupCodeCopy })).toBeVisible();
  await expect(win.getByText(t.setupCodeWarning)).toBeVisible();
  await win.screenshot({ path: `test-results/sou256-setup-code-${loc}.png` });

  // Dismiss → roster now lists the owner (active) and the invitee (pending).
  await win.getByRole('button', { name: t.setupCodeDone }).click();
  const row = win.getByRole('row', { name: new RegExp(EMP_USER.replace('.', '\\.')) });
  await expect(row).toBeVisible();
  await expect(row.getByText(t.roleSecretary)).toBeVisible();
  await expect(row.getByText(t.statusPending)).toBeVisible();
  await expect(win.getByRole('row', { name: /directrice/ }).getByText(t.statusActive)).toBeVisible();

  await win.screenshot({ path: `test-results/sou256-roster-${loc}.png` });
});

test('S3 — duplicate username is rejected inline, no setup code is minted', async () => {
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);
  await inviteViaBridge(win, EMP_USER);

  await gotoTeamTab(win, loc);
  await openInviteDialog(win, loc);
  await submitInvite(win, EMP_USER, loc);

  await expect(win.getByText(t.usernameAlreadyTaken)).toBeVisible();
  await expect(win.getByRole('heading', { name: t.setupCodeTitle })).toHaveCount(0);
  // The invite dialog stays open so the director can correct the username.
  await expect(win.getByRole('dialog')).toBeVisible();
});

test('S4 — redeem happy path: activate account, then log in with the chosen password', async () => {
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);

  // Invite through the UI and capture the code exactly as the director would read it.
  await gotoTeamTab(win, loc);
  await openInviteDialog(win, loc);
  await submitInvite(win, EMP_USER, loc);
  const code = await readSetupCode(win);
  await win.getByRole('button', { name: t.setupCodeDone }).click();

  await logout(win, loc);
  await gotoRedeem(win, loc);
  await submitRedeem(win, { username: EMP_USER, setupCode: code, newPassword: EMP_PW }, loc);

  // Success surfaces and we are returned to the standard login screen.
  await expect(win.getByText(t.setupSuccess)).toBeVisible();
  await expect(win.getByRole('heading', { name: t.loginTitle })).toBeVisible();
  await win.screenshot({ path: `test-results/sou256-redeem-success-${loc}.png` });

  // The employee can now sign in with the username + password they chose.
  await loginViaForm(win, EMP_USER, EMP_PW, loc);
  await expect(win.getByRole('button', { name: t.logout })).toBeVisible();
  // The app shell rendered for the newly-activated employee. Assert the center
  // name the setup wizard persisted (literal in both locales) — logout + this
  // marker together prove a real authenticated session, not the login screen.
  await expect(win.getByText('Centre principal').first()).toBeVisible();
});

test('S5 — redeem with a garbage code shows setup-code-invalid on the code field', async () => {
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);
  await inviteViaBridge(win, EMP_USER);

  await logout(win, loc);
  await gotoRedeem(win, loc);
  expect(await win.evaluate(() => document.documentElement.dir)).toBe(t.dir);
  await submitRedeem(win, { username: EMP_USER, setupCode: 'WRON-GXXX-0000', newPassword: EMP_PW }, loc);

  await expect(win.getByText(t.setupCodeInvalid)).toBeVisible();
  await expect(win.getByRole('heading', { name: t.loginTitle })).toHaveCount(0);
  await win.screenshot({ path: `test-results/sou256-redeem-invalid-${loc}.png` });
});

test('S6 — a setup code cannot be redeemed twice', async () => {
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);
  const code = await inviteViaBridge(win, EMP_USER);

  await logout(win, loc);

  // First redemption succeeds.
  await gotoRedeem(win, loc);
  await submitRedeem(win, { username: EMP_USER, setupCode: code, newPassword: EMP_PW }, loc);
  await expect(win.getByText(t.setupSuccess)).toBeVisible();
  await expect(win.getByRole('heading', { name: t.loginTitle })).toBeVisible();

  // Second attempt with the same code is refused as already-redeemed.
  await gotoRedeem(win, loc);
  await submitRedeem(win, { username: EMP_USER, setupCode: code, newPassword: EMP_PW }, loc);
  await expect(win.getByText(t.setupCodeAlreadyRedeemed)).toBeVisible();
});
