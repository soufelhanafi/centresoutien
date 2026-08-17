import {
  test,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
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
  VALID_ADMIN,
  type Locale,
} from './team-users.fixtures';
import { AUTH } from './login.fixtures';
import {
  boot as bootInvoices,
  seedInvoice,
} from './invoices.fixtures';
import {
  PAY_STR,
  openInvoiceDetail,
  openRecordPaymentDialog,
  fillPaymentForm,
  submitPaymentForm,
} from './payment-capture.fixtures';
import { STR as STUD, gotoStudents } from './students.fixtures';

/**
 * SOU-265 — trusted session principal + role-scoped director IPC guards (main
 * process). Black-box regression + persistence proof: the app is driven only
 * through its UI and the public preload bridge. No renderer/domain/data
 * implementation is imported.
 *
 * This is a security/main-process change with NO new UI, so the job is
 * regression (writes still work, invite still works, redeem still open) and a
 * cross-process persistence proof (remembered principal survives a restart, so
 * the new owner/admin role guard keeps letting the director through). Runs under
 * both the `fr` (LTR) and `ar` (RTL) Playwright projects.
 */

const locale = () => test.info().project.name as Locale;

// Throwaway employee credentials assembled at runtime (secret-scan friendly);
// meets the redeem password policy: >=8 chars, upper + lower + digit.
const EMP_USER = 'fatima.secretaire';
const EMP_PW = ['Fatima', '2026', '!'].join('');

let live: { app: ElectronApplication; win: Page } | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function bootDirector(loc: Locale): Promise<Page> {
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  await completeSetupAndLogin(live.win, loc);
  return live.win;
}

// ---------------------------------------------------------------------------
// Scenario 1 — Owner regression: the invite flow still works end-to-end.
// Proves the new owner/admin role guard lets the director through and the
// envelope/principal change did not break `user.create` / `user.list`.
// ---------------------------------------------------------------------------
test('S1 — owner can still invite an employee (role guard lets owner through)', async () => {
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);
  await gotoTeamTab(win, loc);

  await openInviteDialog(win, loc);
  await submitInvite(win, EMP_USER, loc);

  await expect(win.getByRole('heading', { name: t.setupCodeTitle })).toBeVisible();
  const code = await readSetupCode(win);
  expect(code, 'a non-empty one-time setup code is minted').toMatch(/[A-Z0-9-]{6,}/);
  await win.screenshot({ path: `test-results/sou265-s1-setup-code-${loc}.png` });

  await win.getByRole('button', { name: t.setupCodeDone }).click();
  const row = win.getByRole('row', { name: new RegExp(EMP_USER.replace('.', '\\.')) });
  await expect(row).toBeVisible();
  await expect(row.getByText(t.roleSecretary)).toBeVisible();
  await expect(row.getByText(t.statusPending)).toBeVisible();
  await expect(win.getByRole('row', { name: /directrice/ }).getByText(t.statusActive)).toBeVisible();
  await win.screenshot({ path: `test-results/sou265-s1-roster-${loc}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Remember-me principal survives an app restart. Log in through
// the UI with the "remember this device" checkbox, close the app, relaunch the
// SAME userData dir: still authenticated (no login screen), and the director can
// STILL invite an employee. If the persisted principal were lost, the new role
// guard would wrongly block the director at `user.create`.
// ---------------------------------------------------------------------------
test('S2 — remembered principal survives restart; director can still invite [DONE-WHEN]', async () => {
  test.setTimeout(60_000);
  const loc = locale();
  const t = T[loc];
  const a = AUTH[loc];
  const dir = freshUserDataDir();

  // Fresh center: create admin + center via the wizard, then land on the shell.
  live = await launch({ locale: loc, plan: 'pro', userDataDir: dir });
  let win = live.win;
  await completeSetupAndLogin(win, loc);

  // Log out, then log back in through the real UI form WITH remember-me ticked.
  await logout(win, loc);
  await win.getByText(a.rememberDevice).click();
  await expect(win.getByRole('checkbox')).toBeChecked();
  await loginViaForm(win, VALID_ADMIN.username, VALID_ADMIN.password, loc);
  await expect(win.getByRole('button', { name: t.logout })).toBeVisible();

  // Restart: close and relaunch the SAME userData dir (same encrypted center DB).
  await live.app.close();
  live = await launch({ locale: loc, plan: 'pro', userDataDir: dir });
  win = live.win;

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

// ---------------------------------------------------------------------------
// Scenario 3 — General write smoke (attribution blast-radius regression). Every
// write now attributes to the real logged-in user; smoke two ordinary director
// writes end-to-end — create a student and record a payment — and confirm they
// still succeed and appear. We are proving the `updatedBy`-everywhere change did
// not break normal create/update flows; who is stored is not inspected.
// ---------------------------------------------------------------------------
test('S3 — ordinary director writes still succeed (create student + record payment)', async () => {
  test.setTimeout(60_000);
  const loc = locale();
  const L = STUD[loc];
  live = await bootInvoices(loc);
  const win = live.win;

  // Write #1 — create a student through the UI dialog; the row appears.
  await gotoStudents(win, L);
  await win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(L.form.nameFr, { exact: false }).fill('Salma Bennani');
  await dialog.getByLabel(L.form.nameAr, { exact: false }).fill('سلمى بناني');
  await dialog.getByLabel(L.form.birthDate, { exact: false }).fill('2011-03-09');
  await dialog.getByLabel(L.form.level, { exact: false }).fill('2AC');
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(win.getByText(L.form.createSuccess).first()).toBeVisible();
  await expect(win.getByRole('row', { name: /Salma Bennani/ })).toBeVisible();
  await win.screenshot({ path: `test-results/sou265-s3-student-${loc}.png` });

  // Write #2 — record a full payment through the invoice-detail UI dialog.
  const P = PAY_STR[loc];
  const seeded = await seedInvoice(win, {
    nameFr: 'Payeur Test',
    nameAr: 'دافع اختبار',
    month: '2026-08',
    priceMad: 200,
    issue: true,
  });
  await openInvoiceDetail(win, seeded, loc);
  const payDialog = await openRecordPaymentDialog(win, P);
  await fillPaymentForm(payDialog, { amountMad: '200' });
  await submitPaymentForm(win, payDialog, P);
  await expect(win.getByText(P.payment.success)).toBeVisible();
  await win.screenshot({ path: `test-results/sou265-s3-payment-${loc}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 4 — First-login setup-code redeem is still open. The redeem flow runs
// from the login screen with NO authenticated principal; it must NOT be caught
// by the new owner/admin role guard. Invite an employee (owner), read the code,
// log out, redeem it from the login screen, and confirm success.
// ---------------------------------------------------------------------------
test('S4 — first-login redeem stays open (not caught by the role guard)', async () => {
  test.setTimeout(60_000);
  const loc = locale();
  const t = T[loc];
  const win = await bootDirector(loc);

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

// ---------------------------------------------------------------------------
// Scenario 5 — Secretary/viewer session is rejected at the main-process boundary
// for `user.create` / `user.list`. BLOCKED-BY-ENV: the renderer hides the
// Team/Users surface from non-owner roles, so there is NO black-box UI path to a
// secretary session that reaches those channels. Forcing it would require
// hacking the renderer or calling IPC directly, which this suite does not do.
// This rejection is covered by the domain/main-process unit tests.
// ---------------------------------------------------------------------------
test.skip('S5 — secretary blocked at IPC boundary [BLOCKED-BY-ENV: no UI path; covered by unit tests]', () => {});
