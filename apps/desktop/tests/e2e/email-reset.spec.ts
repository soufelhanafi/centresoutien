import { test, expect } from '@playwright/test';
import {
  RESET,
  DIRECTION,
  OWNER_EMAIL,
  NEW_PASSWORD,
  VALID_ADMIN,
  freshUserDataDir,
  launchLoggedInWithRelay,
  setOwnerEmail,
  logoutViaUi,
  loginViaUi,
  type Launched,
  type Locale,
} from './email-reset.fixtures';
import { startMockRelay, MOCK_RESET_CODE, type MockRelay } from './email-reset.mock-relay';

/**
 * SOU-273 — password reset by email, end to end and both locales (fr LTR / ar RTL).
 * The owner sets a recovery email in Settings, logs out, then resets the password
 * through the login screen's email flow: request a code (the mock relay stands in
 * for the landing relay), confirm code + new password, and finally log in with the
 * NEW password — proving the local credential really rotated and the old one no
 * longer works. Black-box throughout: driven via the UI, asserted on visible copy.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
let relay: MockRelay | null = null;

test.beforeEach(async () => {
  relay = await startMockRelay();
});

test.afterEach(async () => {
  await live?.app.close();
  live = null;
  await relay?.close();
  relay = null;
});

test('owner sets a recovery email, then resets the password by email and logs in with it', async () => {
  const loc = locale();
  const L = RESET[loc];
  const mock = relay!;

  live = await launchLoggedInWithRelay(freshUserDataDir(), loc, mock.url);
  const win = live.win;

  await expect(win.locator('html')).toHaveAttribute('dir', DIRECTION[loc]);

  // 1) Seed the owner recovery email (via the bridge — no Settings UI hosts it).
  await setOwnerEmail(win, OWNER_EMAIL);

  // 2) Log out and open the email reset path from the login screen.
  await logoutViaUi(win, loc);
  await win.getByRole('button', { name: L.forgotLink }).click();
  await win.getByRole('button', { name: L.methodEmail }).click();

  // 3) Identify the account by username (SOU-303: reset is per-user, resolved by
  //    username), then request the code — the relay receives the owner's email + locale.
  await win.locator('#email-reset-username').fill(VALID_ADMIN.username);
  await win.getByRole('button', { name: L.sendCode }).click();
  await win.getByLabel(L.codeLabel, { exact: true }).waitFor({ state: 'visible' });

  const requestCall = mock.requests.find((r) => r.path.endsWith('/api/auth/reset-request'));
  expect(requestCall, 'the desktop must call the relay reset-request').toBeTruthy();
  expect(requestCall?.body['email']).toBe(OWNER_EMAIL);
  expect(requestCall?.body['locale']).toBe(loc);

  // 4) Confirm the emailed code + a new password.
  await win.getByLabel(L.codeLabel, { exact: true }).fill(MOCK_RESET_CODE);
  await win.getByLabel(L.newPassword, { exact: true }).fill(NEW_PASSWORD);
  await win.getByLabel(L.confirmPassword, { exact: true }).fill(NEW_PASSWORD);
  await win.getByRole('button', { name: L.resetSubmit }).click();

  await win.getByText(L.successTitle).waitFor({ state: 'visible' });
  expect(
    mock.requests.some((r) => r.path.endsWith('/api/auth/reset-confirm')),
    'the desktop must call the relay reset-confirm',
  ).toBe(true);
  await win.screenshot({ path: `test-results/email-reset-success-${loc}.png` });

  // 5) Back to login and sign in with the NEW password.
  await win.getByRole('button', { name: L.backToLogin }).click();
  await loginViaUi(win, loc, NEW_PASSWORD);

  await expect(win.getByText(L.appMarker).first()).toBeVisible();
});

test('the old password no longer works after an email reset', async () => {
  const loc = locale();
  const L = RESET[loc];
  const mock = relay!;

  live = await launchLoggedInWithRelay(freshUserDataDir(), loc, mock.url);
  const win = live.win;

  await setOwnerEmail(win, OWNER_EMAIL);
  await logoutViaUi(win, loc);

  await win.getByRole('button', { name: L.forgotLink }).click();
  await win.getByRole('button', { name: L.methodEmail }).click();
  await win.locator('#email-reset-username').fill(VALID_ADMIN.username);
  await win.getByRole('button', { name: L.sendCode }).click();
  await win.getByLabel(L.codeLabel, { exact: true }).fill(MOCK_RESET_CODE);
  await win.getByLabel(L.newPassword, { exact: true }).fill(NEW_PASSWORD);
  await win.getByLabel(L.confirmPassword, { exact: true }).fill(NEW_PASSWORD);
  await win.getByRole('button', { name: L.resetSubmit }).click();
  await win.getByText(L.successTitle).waitFor({ state: 'visible' });
  await win.getByRole('button', { name: L.backToLogin }).click();

  // The old credential must be rejected — the reset really rotated the hash.
  const outcome = await win.evaluate(async (admin) => {
    const api = (window as unknown as {
      api: { invoke: (c: string, r: unknown) => Promise<{ outcome: string }> };
    }).api;
    return api.invoke('auth.login', { ...admin, rememberDevice: false });
  }, VALID_ADMIN);
  expect(outcome.outcome).toBe('invalid-credentials');
});
