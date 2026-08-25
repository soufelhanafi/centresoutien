import { test, expect } from '@playwright/test';
import { CP, freshUserDataDir, getCenter, launch, type Launched, type Locale } from './center-profile.fixtures';

/**
 * SOU-111 — First-run wizard Center Profile step (black-box).
 *
 * Acceptance: the wizard's Center Profile step is a real, mandatory,
 * non-skippable step — you cannot advance past it without the required data, and
 * the data entered there persists (a center row exists after setup).
 *
 * Runs under both `fr` (LTR) and `ar` (RTL).
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

// Blocks-advancing-while-empty (mandatory-field guard) trimmed per SOU-142 —
// unit-test the wizard step schema instead; critical-only E2E keeps the
// persistence proof below.

test('data entered in the wizard Center Profile step persists as a center row', async () => {
  const loc = locale();
  const t = CP[loc];
  const dir = freshUserDataDir();
  live = await launch({ locale: loc, plan: 'pro', userDataDir: dir });
  const win = live.win;

  await win.getByRole('button', { name: t.createModeCard }).click();
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
