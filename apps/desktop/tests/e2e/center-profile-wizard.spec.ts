import { test, expect } from '@playwright/test';
import { CP, freshUserDataDir, getCenter, launch, type Launched, type Locale } from './center-profile.fixtures';

/**
 * SOU-28 — First-run wizard Center Profile step (black-box).
 *
 * Acceptance: the wizard's Center Profile step is a real, mandatory,
 * non-skippable step — you cannot advance past it without the required data, and
 * the data entered there persists (a center row exists after setup).
 *
 * Runs under both `fr` (LTR) and `ar` (RTL).
 *
 * NOTE: the wizard step is still a stub on this branch — wiring the real form in
 * is tracked as SOU-111. These two specs assert the target behaviour and are
 * marked `fixme` until that lands; unskip them as part of SOU-111.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

test.fixme('the Center Profile step captures required data and blocks advancing while empty', async () => {
  const loc = locale();
  const t = CP[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;

  // Reach the Center Profile step.
  await win.getByRole('radio', { name: t.langRadio }).check();
  await win.getByRole('button', { name: t.next }).click();
  await expect(win.getByText(t.wizardCenterTitle).first()).toBeVisible();

  // It must be non-skippable...
  await expect(win.getByRole('button', { name: t.skip })).toHaveCount(0);

  // ...and it must actually collect the center identity here.
  const nameField = win.getByLabel(t.nameLabel, { exact: true });
  await expect(nameField).toBeVisible({ timeout: 5000 });

  // Attempting to advance with the name empty must NOT leave the step.
  await win.getByRole('button', { name: t.next }).click();
  await expect(win.getByText(t.wizardCenterTitle).first()).toBeVisible();

  await win.screenshot({ path: `test-results/wizard-center-step-${loc}.png` });
});

test.fixme('data entered in the wizard Center Profile step persists as a center row', async () => {
  const loc = locale();
  const t = CP[loc];
  const dir = freshUserDataDir();
  live = await launch({ locale: loc, plan: 'pro', userDataDir: dir });
  const win = live.win;

  await win.getByRole('radio', { name: t.langRadio }).check();
  await win.getByRole('button', { name: t.next }).click();
  await expect(win.getByText(t.wizardCenterTitle).first()).toBeVisible();

  await win.getByLabel(t.nameLabel, { exact: true }).fill('Centre Wizard');
  await win.getByLabel(t.addressLabel, { exact: true }).fill('Rue du Wizard');
  await win.getByLabel(t.phoneLabel, { exact: true }).fill('+212612345678');
  await win.getByLabel(t.emailLabel, { exact: true }).fill('wizard@centre.ma');
  await win.getByRole('button', { name: t.next }).click();

  // The center identity captured in the wizard is persisted.
  await expect.poll(async () => (await getCenter(win))?.name, { timeout: 5000 }).toBe('Centre Wizard');
});
