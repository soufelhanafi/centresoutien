import { test, expect } from '@playwright/test';
import {
  CP,
  centerForm,
  completeSetupAndLogin,
  freshUserDataDir,
  getCenter,
  gotoSettings,
  launch,
  makeLogoFile,
  type Launched,
  type Locale,
} from './center-profile.fixtures';

/**
 * SOU-28 — Center logo (black-box).
 *
 * Acceptance: picking a logo stores a file under app data and the DB persists a
 * *relative* filename; the logo shows after reload; removing/replacing works.
 * Runs under both `fr` (LTR) and `ar` (RTL).
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function fillValidProfile(win: Awaited<Launched>['win'], loc: Locale) {
  const f = centerForm(win, loc);
  await f.name().fill('Centre Logo');
  await f.address().fill('Rue du Logo');
  await f.phone().fill('+212612345678');
  await f.email().fill('logo@centre.ma');
}

test('picking a logo persists a relative filename and shows a preview after reload', async () => {
  const loc = locale();
  const t = CP[loc];
  const dir = freshUserDataDir();
  live = await launch({ locale: loc, plan: 'pro', userDataDir: dir });
  const win = live.win;
  await completeSetupAndLogin(win, loc);

  await fillValidProfile(win, loc);
  const f = centerForm(win, loc);
  await f.logo().setInputFiles(makeLogoFile());
  await f.submit().click();
  await expect(win.getByText(t.saveSuccess).first()).toBeVisible();

  // The DB holds a *relative* reference (not an absolute path).
  const stored = await getCenter(win);
  expect(stored?.logoPath).toBeTruthy();
  expect(stored?.logoPath ?? '').not.toMatch(/^([A-Za-z]:[\\/]|\/)/);

  // Acceptance: "logo shows after reload". After reloading, the persisted logo
  // must be rendered as a visible <img> re-hydrated from app data.
  await win.reload();
  await gotoSettings(win, loc);
  await expect.poll(async () => (await getCenter(win))?.logoPath).toBe(stored?.logoPath);
  await win.screenshot({ path: `test-results/center-logo-${loc}.png` });
  await expect(win.locator('form img').first()).toBeVisible({ timeout: 5000 });
});

// Removing a logo (symmetric, low-risk case) trimmed per SOU-142 — critical-only E2E.
