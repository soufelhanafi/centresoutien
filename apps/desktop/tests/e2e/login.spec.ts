import { test, expect, type Page } from '@playwright/test';
import {
  AUTH,
  DIRECTION,
  VALID_ADMIN,
  freshUserDataDir,
  launch,
  launchLoggedOut,
  bridgeLogin,
  sessionAuthenticated,
  type Launched,
  type Locale,
} from './login.fixtures';

/**
 * SOU-27 — Login screen + session persistence + 5-attempt / 15-minute lockout.
 * Black-box: the app is driven only through its UI and the public preload
 * bridge. Each test uses a fresh userData dir (fresh encrypted center DB), and
 * runs under both the `fr` (LTR) and `ar` (RTL) Playwright projects.
 *
 * Reaching the login screen requires an admin to exist (created by the SOU-25
 * first-run wizard). The fixtures seed that admin through `admin.create`, so the
 * FirstRunGate passes and the AuthGate renders the login form.
 */

// Throwaway wrong password assembled from fragments (secret-scan friendly). Any
// value other than VALID_ADMIN.password works — every attempt using it must fail.
const WRONGPW = ['Wr', 'ong', 'Pass9'].join('');

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

// ---- UI markers ---------------------------------------------------------------

const loginHeading = (win: Page, L: Record<string, string>) =>
  win.getByRole('heading', { name: L.loginTitle });
const usernameField = (win: Page, L: Record<string, string>) =>
  win.getByLabel(L.username, { exact: true });
const passwordField = (win: Page, L: Record<string, string>) =>
  win.getByLabel(L.password, { exact: true });
const submitBtn = (win: Page, L: Record<string, string>) =>
  win.getByRole('button', { name: L.submit });
const logoutBtn = (win: Page, L: Record<string, string>) =>
  win.getByRole('button', { name: L.logout });
const lockNotice = (win: Page, L: Record<string, string>) => win.getByText(L.lockedTitle);

async function fillCreds(win: Page, L: Record<string, string>, password: string) {
  await usernameField(win, L).fill(VALID_ADMIN.username);
  await passwordField(win, L).fill(password);
}

// ---- scenarios ----------------------------------------------------------------

test('S1 — login form renders in the locale with correct direction and all controls', async () => {
  const loc = locale();
  const L = AUTH[loc];
  live = await launchLoggedOut(freshUserDataDir(), loc);
  const win = live.win;

  await expect(loginHeading(win, L)).toBeVisible();
  await expect(win.getByText(L.subtitle)).toBeVisible();
  await expect(usernameField(win, L)).toBeVisible();
  await expect(passwordField(win, L)).toBeVisible();
  await expect(win.getByText(L.rememberDevice)).toBeVisible();
  await expect(submitBtn(win, L)).toBeVisible();

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[loc]);
  expect(await win.evaluate(() => document.documentElement.lang)).toBe(loc);

  // Not yet authenticated: no logout affordance, no app content.
  await expect(logoutBtn(win, L)).toHaveCount(0);
  expect(await sessionAuthenticated(win)).toBe(false);

  await win.screenshot({ path: `test-results/login-screen-${loc}.png` });
});

test('S2 — empty submit is blocked by field validation (invalid input)', async () => {
  const loc = locale();
  const L = AUTH[loc];
  live = await launchLoggedOut(freshUserDataDir(), loc);
  const win = live.win;

  await submitBtn(win, L).click();

  // Stays on the login screen; required-field errors surface; no auth happens.
  await expect(win.getByText(L.usernameRequired)).toBeVisible();
  await expect(win.getByText(L.passwordRequired)).toBeVisible();
  await expect(loginHeading(win, L)).toBeVisible();
  await expect(logoutBtn(win, L)).toHaveCount(0);
  expect(await sessionAuthenticated(win)).toBe(false);
});

test('S3 — valid credentials open the app (happy path)', async () => {
  const loc = locale();
  const L = AUTH[loc];
  live = await launchLoggedOut(freshUserDataDir(), loc);
  const win = live.win;

  await expect(loginHeading(win, L)).toBeVisible();
  await fillCreds(win, L, VALID_ADMIN.password);
  await submitBtn(win, L).click();

  // Authenticated app appears; login form is gone. (Remember-device is OFF here,
  // so `auth.session` — the *persisted* remembered-device probe — stays false;
  // in-session authentication is proven by the app content itself.)
  await expect(logoutBtn(win, L)).toBeVisible();
  await expect(win.getByText(L.appMarker)).toBeVisible();
  await expect(loginHeading(win, L)).toHaveCount(0);

  await win.screenshot({ path: `test-results/login-success-${loc}.png` });
});

test('S4 — remember ON: reopen skips login (session persisted) [DONE-WHEN]', async () => {
  const loc = locale();
  const L = AUTH[loc];
  const dir = freshUserDataDir();

  live = await launchLoggedOut(dir, loc);
  let win = live.win;
  await win.getByText(L.rememberDevice).click(); // toggle remember-device ON
  await expect(win.getByRole('checkbox')).toBeChecked();
  await fillCreds(win, L, VALID_ADMIN.password);
  await submitBtn(win, L).click();
  await expect(logoutBtn(win, L)).toBeVisible();
  await live.app.close();

  // Reopen the SAME center DB → still authenticated, straight to the app.
  live = await launch(dir, loc);
  win = live.win;
  await expect(logoutBtn(win, L)).toBeVisible();
  await expect(loginHeading(win, L)).toHaveCount(0);
  expect(await sessionAuthenticated(win)).toBe(true);
});

test('S5 — remember OFF: session cleared on quit, login required on reopen', async () => {
  const loc = locale();
  const L = AUTH[loc];
  const dir = freshUserDataDir();

  live = await launchLoggedOut(dir, loc);
  let win = live.win;
  // Remember-device left OFF (default).
  await expect(win.getByRole('checkbox')).not.toBeChecked();
  await fillCreds(win, L, VALID_ADMIN.password);
  await submitBtn(win, L).click();
  await expect(logoutBtn(win, L)).toBeVisible(); // authenticated in-session
  await live.app.close();

  // Reopen the SAME center DB → session was not remembered → login required.
  live = await launch(dir, loc);
  win = live.win;
  await expect(loginHeading(win, L)).toBeVisible();
  await expect(logoutBtn(win, L)).toHaveCount(0);
  expect(await sessionAuthenticated(win)).toBe(false);
});

test('S6 — six wrong tries hit the lockout; the first five do not [DONE-WHEN]', async () => {
  test.setTimeout(60_000);
  const loc = locale();
  live = await launchLoggedOut(freshUserDataDir(), loc);
  const win = live.win;

  // Contract (confirmed behavior): attempts 1–5 wrong are ALLOWED
  // (invalid-credentials), and only the 6th wrong attempt locks the account.
  for (let n = 1; n <= 5; n++) {
    const res = await bridgeLogin(win, {
      username: VALID_ADMIN.username,
      password: WRONGPW,
      rememberDevice: false,
    });
    expect(
      res.outcome,
      `wrong attempt ${n} must be allowed (invalid-credentials); only the 6th may lock`,
    ).toBe('invalid-credentials');
  }

  const sixth = await bridgeLogin(win, {
    username: VALID_ADMIN.username,
    password: WRONGPW,
    rememberDevice: false,
  });
  expect(sixth.outcome, 'the 6th wrong attempt must lock the account').toBe('locked-out');
  if (sixth.outcome === 'locked-out') {
    const minutesAhead = (sixth.lockedUntilMs - Date.now()) / 60_000;
    expect(minutesAhead, '15-minute cooldown').toBeGreaterThan(14);
    expect(minutesAhead, '15-minute cooldown').toBeLessThanOrEqual(15.5);
  }
});

test('S7 — lockout is UI-observable: notice, 15-min cooldown, inputs disabled', async () => {
  test.setTimeout(60_000);
  const loc = locale();
  const L = AUTH[loc];
  live = await launchLoggedOut(freshUserDataDir(), loc);
  const win = live.win;

  // Deterministically lock the account (bridge and form share one counter),
  // then surface the lock in the UI with a single form submit.
  let out = await bridgeLogin(win, { username: VALID_ADMIN.username, password: WRONGPW });
  for (let n = 1; n <= 10 && out.outcome !== 'locked-out'; n++) {
    out = await bridgeLogin(win, { username: VALID_ADMIN.username, password: WRONGPW });
  }
  expect(out.outcome).toBe('locked-out');

  await fillCreds(win, L, WRONGPW);
  await submitBtn(win, L).click();

  await expect(lockNotice(win, L)).toBeVisible();
  // 15-minute cooldown surfaced to the user (mm:ss countdown).
  await expect(win.getByText(/\d{2}:\d{2}/).first()).toBeVisible();
  // Credentials cannot be re-entered while locked.
  await expect(usernameField(win, L)).toBeDisabled();
  await expect(passwordField(win, L)).toBeDisabled();

  await win.screenshot({ path: `test-results/login-lockout-${loc}.png` });
});

test('S8 — lockout is persisted in the DB across an app restart', async () => {
  test.setTimeout(60_000);
  const loc = locale();
  const dir = freshUserDataDir();

  live = await launchLoggedOut(dir, loc);
  let win = live.win;
  // Lock the account (drive enough wrong attempts to reach the lock).
  for (let n = 1; n <= 6; n++) {
    const res = await bridgeLogin(win, {
      username: VALID_ADMIN.username,
      password: WRONGPW,
      rememberDevice: false,
    });
    if (res.outcome === 'locked-out') break;
  }
  await live.app.close();

  // Reopen the SAME center DB → the lock must still be in force.
  live = await launch(dir, loc);
  win = live.win;
  const afterReopen = await bridgeLogin(win, {
    username: VALID_ADMIN.username,
    password: WRONGPW,
    rememberDevice: false,
  });
  expect(
    afterReopen.outcome,
    'the lockout must survive an app restart (persisted in DB)',
  ).toBe('locked-out');
});

test('S9 — a successful login resets the failed-attempt counter to zero', async () => {
  test.setTimeout(60_000);
  const loc = locale();
  live = await launchLoggedOut(freshUserDataDir(), loc);
  const win = live.win;

  // Three wrong attempts (still well under the lock).
  for (let n = 1; n <= 3; n++) {
    const res = await bridgeLogin(win, {
      username: VALID_ADMIN.username,
      password: WRONGPW,
      rememberDevice: false,
    });
    expect(res.outcome).toBe('invalid-credentials');
  }
  const beforeReset = await bridgeLogin(win, {
    username: VALID_ADMIN.username,
    password: WRONGPW,
    rememberDevice: false,
  });
  // 4th consecutive failure → counter is deep into the window.
  expect(beforeReset.outcome).toBe('invalid-credentials');

  // A correct login succeeds and must reset the counter.
  const ok = await bridgeLogin(win, {
    username: VALID_ADMIN.username,
    password: VALID_ADMIN.password,
    rememberDevice: false,
  });
  expect(ok.outcome).toBe('success');

  // A single fresh wrong attempt should report the FULL window again
  // (remaining back to the max), proving the counter was reset to zero.
  const afterReset = await bridgeLogin(win, {
    username: VALID_ADMIN.username,
    password: WRONGPW,
    rememberDevice: false,
  });
  expect(afterReset.outcome).toBe('invalid-credentials');
  if (afterReset.outcome === 'invalid-credentials' && beforeReset.outcome === 'invalid-credentials') {
    expect(
      afterReset.remainingAttempts,
      'after a successful login the remaining-attempt count must be back to its maximum',
    ).toBeGreaterThan(beforeReset.remainingAttempts);
  }
});
