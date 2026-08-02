import { test, expect } from '@playwright/test';
import {
  CP,
  centerForm,
  completeSetupAndLogin,
  freshUserDataDir,
  gotoSettings,
  launch,
  type Launched,
  type Locale,
} from './center-profile.fixtures';

/**
 * SOU-28 — Center profile in Settings (black-box).
 *
 * Critical-only per SOU-142: kept scenario proves the save-and-persist round
 * trip through a reload — the one genuinely cross-layer proof this screen
 * needs. Visibility/editability, restart survival (redundant with reload),
 * bilingual-field-shape, email/required/phone validation are unit/component
 * level (Zod schema + E.164 normalization already unit-tested; phone
 * normalization is also covered end-to-end in parents-crud.spec.ts).
 *
 * Runs under both the `fr` (LTR) and `ar` (RTL) projects.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
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
  await gotoSettings(win, loc);
  await expect(f.name()).toHaveValue('Centre Al Amal');
  await expect(f.address()).toHaveValue('12 Rue de Casablanca');
  await expect(f.email()).toHaveValue('contact@alamal.ma');
});
