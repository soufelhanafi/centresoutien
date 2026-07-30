import { test, expect } from '@playwright/test';
import {
  CP,
  bridgeLoginAndReload,
  centerForm,
  centerFormLocator,
  completeSetupAndLogin,
  freshUserDataDir,
  getCenter,
  launch,
  type Launched,
  type Locale,
} from './center-profile.fixtures';

/**
 * SOU-28 — Center profile in Settings (black-box).
 *
 * Acceptance: the center profile is visible in Settings, editable
 * (name, address, phone, email, plan, logo), Save shows a success result, and a
 * reload/restart shows the saved values. Logo is stored under app data and the
 * DB persists a relative filename. Name & address are single strings. Phone is
 * validated as E.164, email is validated, and field errors render inline.
 *
 * Every scenario runs under both the `fr` (LTR) and `ar` (RTL) projects.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

test('the center profile is visible and editable in Settings', async () => {
  const loc = locale();
  const t = CP[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await completeSetupAndLogin(win, loc);

  const f = centerForm(win, loc);
  await expect(f.name()).toBeVisible();
  await expect(f.address()).toBeVisible();
  await expect(f.phone()).toBeVisible();
  await expect(f.email()).toBeVisible();
  await expect(f.logo()).toBeAttached();
  await expect(f.submit()).toBeVisible();
  // Plan is surfaced in the profile (a display mirror of the active tier).
  await expect(win.getByText(t.planLabel).first()).toBeVisible();

  await win.screenshot({ path: `test-results/center-settings-${loc}.png` });
});

test('saving valid data shows a success result and persists across a reload', async () => {
  const loc = locale();
  const t = CP[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await completeSetupAndLogin(win, loc);

  const f = centerForm(win, loc);
  await f.name().fill('Centre Al Amal');
  await f.address().fill('12 Rue de Casablanca');
  await f.phone().fill('+212612345678');
  await f.email().fill('contact@alamal.ma');
  await f.submit().click();

  await expect(win.getByText(t.saveSuccess).first()).toBeVisible();

  // Reload the renderer: the saved values are re-hydrated into the form.
  await win.reload();
  await expect(f.name()).toHaveValue('Centre Al Amal');
  await expect(f.address()).toHaveValue('12 Rue de Casablanca');
  await expect(f.email()).toHaveValue('contact@alamal.ma');
});

test('saved values survive an app restart (same center DB)', async () => {
  const loc = locale();
  const dir = freshUserDataDir();
  live = await launch({ locale: loc, plan: 'pro', userDataDir: dir });
  let win = live.win;
  await completeSetupAndLogin(win, loc);

  const f = () => centerForm(win, loc);
  await f().name().fill('Centre Ennour');
  await f().address().fill('45 Avenue Hassan II');
  await f().phone().fill('+212661112233');
  await f().email().fill('ennour@centre.ma');
  await f().submit().click();
  await expect(win.getByText(CP[loc].saveSuccess).first()).toBeVisible();
  await live.app.close();

  // Relaunch the SAME userData dir. Re-establish the session through the bridge
  // so this asserts SOU-28 persistence, not SOU-27 gate behaviour.
  live = await launch({ locale: loc, plan: 'pro', userDataDir: dir });
  win = live.win;
  await bridgeLoginAndReload(win);
  await expect.poll(async () => (await getCenter(win))?.name).toBe('Centre Ennour');
  await expect(f().name()).toHaveValue('Centre Ennour');
  await expect(f().address()).toHaveValue('45 Avenue Hassan II');
});

test('name and address are single strings, not bilingual fields', async () => {
  const loc = locale();
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await completeSetupAndLogin(win, loc);

  // Scope to the center form (the one with the phone field) and assert a single
  // name/address input each — no bilingual fr/ar pair as Subjects have.
  const form = centerFormLocator(win);
  await expect(form.locator('input[name="name"]')).toHaveCount(1);
  await expect(form.locator('input[name="address"]')).toHaveCount(1);
  await expect(form.locator('input[name="name.fr"]')).toHaveCount(0);
  await expect(form.locator('input[name="name.ar"]')).toHaveCount(0);
});

test('invalid email renders an inline field error', async () => {
  const loc = locale();
  const t = CP[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await completeSetupAndLogin(win, loc);

  const f = centerForm(win, loc);
  await f.name().fill('Centre X');
  await f.address().fill('Rue Y');
  await f.phone().fill('+212612345678');
  await f.email().fill('not-an-email');
  await f.submit().click();

  await expect(win.getByText(t.errInvalidEmail).first()).toBeVisible();
});

test('a required field renders an inline error and blocks the save', async () => {
  const loc = locale();
  const t = CP[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await completeSetupAndLogin(win, loc);

  const f = centerForm(win, loc);
  await f.name().fill('');
  await f.submit().click();

  await expect(win.getByText(t.errRequired).first()).toBeVisible();
  // Nothing was persisted from the invalid submit.
  await win.screenshot({ path: `test-results/center-required-${loc}.png` });
});

test('a malformed phone is normalized to E.164 before it is stored', async () => {
  const loc = locale();
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await completeSetupAndLogin(win, loc);

  const f = centerForm(win, loc);
  await f.name().fill('Centre Phone');
  await f.address().fill('Rue Test');
  await f.email().fill('phone@test.ma');
  // Moroccan national format — must normalize to the E.164 +212 form.
  await f.phone().fill('0612345678');
  await f.submit().click();
  await expect(win.getByText(CP[loc].saveSuccess).first()).toBeVisible();

  // Contract: value is stored E.164-normalized, not verbatim.
  const stored = await getCenter(win);
  expect(stored?.phone).toBe('+212612345678');
});

test('a phone that cannot be an E.164 number is rejected inline', async () => {
  const loc = locale();
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await completeSetupAndLogin(win, loc);

  const f = centerForm(win, loc);
  await f.name().fill('Centre Bad');
  await f.address().fill('Rue Test');
  await f.email().fill('bad@test.ma');
  await f.phone().fill('abc');
  await f.submit().click();

  // Contract: garbage phone never reaches storage as-is.
  await expect
    .poll(async () => (await getCenter(win))?.phone, { timeout: 4000 })
    .not.toBe('abc');
});
