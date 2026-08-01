import { test, expect, type Page } from '@playwright/test';
import {
  S,
  VALID_ADMIN,
  completeSetupAndLogin,
  freshUserDataDir,
  gotoSettingsTab,
  launch,
  launchNoLocaleOverride,
  loginViaForm,
  logout,
  passwordForm,
  type Launched,
  type Locale,
} from './settings-tabs.fixtures';

/**
 * SOU-31 — Settings page (tabbed): profile / hours / holidays / password /
 * language / plan, black-box.
 *
 * Acceptance: tabbed Settings surface, six tabs (Center Profile, Center
 * Hours, Holidays, Password, Language, Plan-read-only). Every setting
 * persists and is reflected across the app on next screen visit.
 *
 * Every scenario runs under both the `fr` (LTR) and `ar` (RTL) Playwright
 * projects.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

// ---------------------------------------------------------------------------
// Scenario 1 — tabbed layout, all six tabs reachable
// ---------------------------------------------------------------------------

test('Scenario 1 — Settings renders as a tabbed layout with all six tabs reachable', async () => {
  const loc = locale();
  const t = S[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await completeSetupAndLogin(win, loc);

  const tablist = win.getByRole('tablist');
  await expect(tablist).toBeVisible();

  const expectedTabs = [t.tabs.profile, t.tabs.hours, t.tabs.holidays, t.tabs.password, t.tabs.language, t.tabs.plan];
  for (const name of expectedTabs) {
    await expect(win.getByRole('tab', { name })).toBeVisible();
  }
  await expect(win.getByRole('tab')).toHaveCount(6);

  // Only one panel's distinctive content is visible at a time — this is a
  // tabbed surface, not six stacked sections. Profile is the default tab.
  // (Scope to the active tabpanel: the tab triggers themselves render text
  // like "Langue" regardless of which panel is active.)
  const panel = win.getByRole('tabpanel');
  await expect(panel.getByText(t.password.heading)).toHaveCount(0);
  await expect(panel.getByText(t.language.heading, { exact: true })).toHaveCount(0);

  // Switching tabs swaps the panel content.
  await win.getByRole('tab', { name: t.tabs.password }).click();
  await expect(panel.getByText(t.password.heading)).toBeVisible();

  await win.getByRole('tab', { name: t.tabs.language }).click();
  await expect(panel.getByText(t.language.heading, { exact: true })).toBeVisible();
  await expect(panel.getByText(t.password.heading)).toHaveCount(0);

  await win.getByRole('tab', { name: t.tabs.plan }).click();
  await expect(panel.getByText(t.plan.heading)).toBeVisible();

  await win.screenshot({ path: `test-results/settings-tabs-${loc}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 2 — regression: Profile / Hours / Holidays tabs still work
// ---------------------------------------------------------------------------

test('Scenario 2 — Center Profile, Center Hours, Holidays tabs still render their pre-existing content', async () => {
  const loc = locale();
  const t = S[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await completeSetupAndLogin(win, loc);

  // Profile is the default tab and shows the wizard-seeded center name/phone.
  await win.getByRole('tab', { name: t.tabs.profile }).click();
  const phoneInput = win.locator('input[name="phone"]');
  await expect(phoneInput).toBeVisible();
  await expect(phoneInput).toHaveValue('+212612345678');

  // Center Hours: seven weekday toggles, defaults 09:00-18:00.
  await win.getByRole('tab', { name: t.tabs.hours }).click();
  await expect(win.getByRole('switch')).toHaveCount(7);
  await expect(win.locator('input[name="week.0.open"]')).toHaveValue('09:00');

  // Holidays: empty state renders with an "add holiday" affordance.
  await win.getByRole('tab', { name: t.tabs.holidays }).click();
  await expect(win.getByRole('button').filter({ hasText: /./ }).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 3 — Password tab
// ---------------------------------------------------------------------------

test('Scenario 3a — wrong current password shows a localized error and does not change the password', async () => {
  const loc = locale();
  const t = S[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await completeSetupAndLogin(win, loc);
  await gotoSettingsTab(win, loc, t.tabs.password);

  const f = passwordForm(win);
  await f.current().fill('WrongPassword1');
  await f.next().fill('NewCasa2026!');
  await f.confirm().fill('NewCasa2026!');
  await win.getByRole('button', { name: t.password.submit }).click();

  await expect(win.getByText(t.password.errWrongCurrent)).toBeVisible();
  await expect(win.getByText(t.password.success)).toHaveCount(0);

  // Log out and confirm the ORIGINAL password still works — the change never applied.
  await logout(win, loc);
  await loginViaForm(win, loc, VALID_ADMIN.password);
  await expect(win.getByRole('tab', { name: t.tabs.profile })).toBeVisible();
});

test('Scenario 3b — mismatched new/confirm passwords are rejected inline', async () => {
  const loc = locale();
  const t = S[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await completeSetupAndLogin(win, loc);
  await gotoSettingsTab(win, loc, t.tabs.password);

  const f = passwordForm(win);
  await f.current().fill(VALID_ADMIN.password);
  await f.next().fill('NewCasa2026!');
  await f.confirm().fill('SomethingElse2026!');
  await win.getByRole('button', { name: t.password.submit }).click();

  await expect(win.getByText(t.password.errMismatch)).toBeVisible();
  await expect(win.getByText(t.password.success)).toHaveCount(0);
});

test('Scenario 3c — correct current password succeeds; the new admin can log in with the new password after a relogin', async () => {
  const loc = locale();
  const t = S[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await completeSetupAndLogin(win, loc);
  await gotoSettingsTab(win, loc, t.tabs.password);

  const NEW_PASSWORD = 'NewCasa2026!';
  const f = passwordForm(win);
  await f.current().fill(VALID_ADMIN.password);
  await f.next().fill(NEW_PASSWORD);
  await f.confirm().fill(NEW_PASSWORD);
  await win.getByRole('button', { name: t.password.submit }).click();

  await expect(win.getByText(t.password.success)).toBeVisible();
  await win.screenshot({ path: `test-results/settings-password-success-${loc}.png` });

  // Log out; the OLD password must now be rejected.
  await logout(win, loc);
  await loginViaForm(win, loc, VALID_ADMIN.password);
  await expect(win.getByText(t.auth.invalidCredentialsLoose)).toBeVisible();

  // The NEW password logs in successfully.
  await loginViaForm(win, loc, NEW_PASSWORD);
  await expect(win.getByRole('tab', { name: t.tabs.profile })).toBeVisible();
});

test('Scenario 3d — the changed password survives a full app restart', async () => {
  const loc = locale();
  const t = S[loc];
  const dir = freshUserDataDir();
  live = await launch({ locale: loc, plan: 'pro', userDataDir: dir });
  let win = live.win;
  await completeSetupAndLogin(win, loc);
  await gotoSettingsTab(win, loc, t.tabs.password);

  const NEW_PASSWORD = 'NewCasa2026!';
  const f = passwordForm(win);
  await f.current().fill(VALID_ADMIN.password);
  await f.next().fill(NEW_PASSWORD);
  await f.confirm().fill(NEW_PASSWORD);
  await win.getByRole('button', { name: t.password.submit }).click();
  await expect(win.getByText(t.password.success)).toBeVisible();

  // The remembered-device session from setup survives a password change on
  // its own — log out explicitly so the next launch actually exercises the
  // login form against the persisted credential, not the remembered session.
  await logout(win, loc);
  await live.app.close();

  // Fresh process, same userData dir, no remembered session → login screen.
  live = await launch({ locale: loc, plan: 'pro', userDataDir: dir });
  win = live.win;
  await expect(win.getByLabel(t.auth.username, { exact: true })).toBeVisible();

  await loginViaForm(win, loc, VALID_ADMIN.password);
  await expect(win.getByText(t.auth.invalidCredentialsLoose)).toBeVisible();

  await loginViaForm(win, loc, NEW_PASSWORD);
  // A fresh login lands on the default (dashboard) route, not back on
  // Settings — assert the app shell rendered via the sidebar nav, then
  // confirm Settings (and its tabs) is still reachable from there.
  const navLabel = loc === 'ar' ? 'الإعدادات' : 'Paramètres';
  await expect(win.getByRole('link', { name: navLabel })).toBeVisible();
  await win.getByRole('link', { name: navLabel }).click();
  await expect(win.getByRole('tab', { name: t.tabs.profile })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 4 — Language tab
// ---------------------------------------------------------------------------

test('Scenario 4a — switching language in Settings changes the UI language immediately', async () => {
  const loc = locale();
  const t = S[loc];
  const other: Locale = loc === 'fr' ? 'ar' : 'fr';
  const otherT = S[other];

  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await completeSetupAndLogin(win, loc);
  await gotoSettingsTab(win, loc, t.tabs.language);

  await expect(win.getByRole('tabpanel').getByText(t.language.fr)).toBeVisible();
  await expect(win.getByRole('tabpanel').getByText(t.language.ar)).toBeVisible();

  // Click the OTHER language's option.
  const otherLabel = other === 'ar' ? t.language.ar : t.language.fr;
  await win.getByRole('tabpanel').getByText(otherLabel, { exact: true }).click();

  await expect.poll(() => win.evaluate(() => document.documentElement.lang)).toBe(other);
  await expect.poll(() => win.evaluate(() => document.documentElement.dir)).toBe(otherT.dir);
  // The Settings tab labels themselves are now in the other language.
  await expect(win.getByRole('tab', { name: otherT.tabs.password })).toBeVisible();
});

test('Scenario 4b — the language choice survives an app restart (persisted independently of the center DB)', async () => {
  const loc = locale();
  const t = S[loc];
  const other: Locale = loc === 'fr' ? 'ar' : 'fr';
  const dir = freshUserDataDir();

  live = await launch({ locale: loc, plan: 'pro', userDataDir: dir });
  let win = live.win;
  await completeSetupAndLogin(win, loc);
  await gotoSettingsTab(win, loc, t.tabs.language);

  const otherLabel = other === 'ar' ? t.language.ar : t.language.fr;
  await win.getByRole('tabpanel').getByText(otherLabel, { exact: true }).click();
  await expect.poll(() => win.evaluate(() => document.documentElement.lang)).toBe(other);
  await live.app.close();

  // Relaunch with NO CS_LOCALE override at all — the persisted preference
  // (read from the main-process preference file at window creation) is the
  // only thing that can determine the language now.
  live = await launchNoLocaleOverride({ plan: 'pro', userDataDir: dir });
  win = live.win;
  await win.waitForTimeout(500);
  await expect.poll(() => win.evaluate(() => document.documentElement.lang)).toBe(other);
  await expect.poll(() => win.evaluate(() => document.documentElement.dir)).toBe(S[other].dir);
  await win.screenshot({ path: `test-results/settings-language-persist-${loc}.png` });
});

test('Scenario 4c — RTL/LTR: the Settings surface itself mirrors direction per the active language', async () => {
  const loc = locale();
  const t = S[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await completeSetupAndLogin(win, loc);
  await gotoSettingsTab(win, loc, t.tabs.password);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(t.dir);
  expect(await win.evaluate(() => document.documentElement.lang)).toBe(loc);

  await gotoSettingsTab(win, loc, t.tabs.plan);
  expect(await win.evaluate(() => document.documentElement.dir)).toBe(t.dir);
});

// ---------------------------------------------------------------------------
// Scenario 5 — Plan tab (read-only)
// ---------------------------------------------------------------------------

test('Scenario 5a — Plan tab shows the active plan id, limits, and features as read-only (pro)', async () => {
  const loc = locale();
  const t = S[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await completeSetupAndLogin(win, loc);
  await gotoSettingsTab(win, loc, t.tabs.plan);

  const panel = win.getByRole('tabpanel');
  await expect(panel.getByText(t.plan.heading)).toBeVisible();
  await expect(panel.getByText('PRO', { exact: true })).toBeVisible();
  await expect(panel.getByText(t.plan.limitsHeading)).toBeVisible();
  await expect(panel.getByText(t.plan.featuresHeading)).toBeVisible();

  // Read-only: no form controls (inputs, selects, or editable buttons) inside
  // the Plan panel. The header's language/logout controls live outside it.
  await expect(panel.locator('input')).toHaveCount(0);
  await expect(panel.locator('select')).toHaveCount(0);
  await expect(panel.locator('button')).toHaveCount(0);

  await win.screenshot({ path: `test-results/settings-plan-pro-${loc}.png` });
});

test('Scenario 5b — Plan tab reflects a different active plan (essentiel) without any edit affordance', async () => {
  const loc = locale();
  const t = S[loc];
  live = await launch({ locale: loc, plan: 'essentiel', userDataDir: freshUserDataDir() });
  const win = live.win;
  await completeSetupAndLogin(win, loc);
  await gotoSettingsTab(win, loc, t.tabs.plan);

  const panel = win.getByRole('tabpanel');
  await expect(panel.getByText('ESSENTIEL', { exact: true })).toBeVisible();
  await expect(panel.locator('button')).toHaveCount(0);
});
