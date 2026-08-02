import { test, expect, type Page } from '@playwright/test';
import {
  AUTH,
  VALID_ADMIN,
  freshUserDataDir,
  launch,
  launchLoggedOut,
  bridgeLogin,
  type Launched,
  type Locale,
} from './login.fixtures';

/**
 * SOU-27 — Login screen + session persistence + 5-attempt / 15-minute lockout.
 * Black-box: the app is driven only through its UI and the public preload
 * bridge. Each test uses a fresh userData dir (fresh encrypted center DB), and
 * runs under both the `fr` (LTR) and `ar` (RTL) Playwright projects.
 *
 * Critical-only per SOU-142: kept scenarios are the happy path, the
 * remember-device session persistence (genuine cross-process territory), and
 * the account lockout (a security-relevant hard rule — 5 wrong attempts
 * allowed, the 6th locks for 15 minutes, and the lockout is what protects
 * against brute-force). Form-rendering/validation, remember-OFF (the
 * symmetric case), lockout UI-observability, DB-persisted-lockout, and
 * failed-attempt-counter-reset are lower risk and better covered as unit
 * tests of the login throttle policy.
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

async function fillCreds(win: Page, L: Record<string, string>, password: string) {
  await usernameField(win, L).fill(VALID_ADMIN.username);
  await passwordField(win, L).fill(password);
}

// ---- scenarios ----------------------------------------------------------------

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
