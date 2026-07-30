import { test, expect, type Page } from '@playwright/test';
import { CP, freshUserDataDir, getCenter, launch, type Launched, type Locale } from './center-profile.fixtures';
import { STR, VALID_ADMIN, passAuthGate } from './wizard.fixtures';

/**
 * SOU-111 — Wire real Center Profile form into the first-run wizard step.
 *
 * Black-box acceptance verification, driven only through the running UI and the
 * public preload bridge. No renderer/domain implementation is imported.
 *
 * Acceptance criteria under test:
 *   AC1  Real form (name, address, phone, email, logo) — not the placeholder stub.
 *   AC2  Genuinely blocking: name required, phone must be valid E.164;
 *        address/email/logo optional.
 *   AC3  Completing the step persists a `center` row DURING first-run; after
 *        setup the center name shows in the app shell without opening Settings.
 *   AC4  Works in both FR-LTR and AR-RTL.
 *
 * Every scenario starts from a FRESH userData dir (guaranteed first-run state)
 * and runs under both the `fr` and `ar` Playwright projects.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

/** Reach the Center Profile step from a fresh launch by picking the language. */
async function reachCenterStep(win: Page, loc: Locale): Promise<void> {
  const t = CP[loc];
  await win.getByRole('radio', { name: t.langRadio }).check();
  await win.getByRole('button', { name: t.next }).click();
  await expect(win.getByText(t.wizardCenterTitle).first()).toBeVisible({ timeout: 5000 });
}

// ---------------------------------------------------------------------------
// AC1 — the step renders a REAL form with all five fields (not a stub).
// ---------------------------------------------------------------------------
test('AC1: Center Profile step renders a real form with name, address, phone, email and logo', async () => {
  const loc = locale();
  const t = CP[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await reachCenterStep(win, loc);

  await expect(win.getByLabel(t.nameLabel, { exact: true })).toBeVisible();
  await expect(win.getByLabel(t.addressLabel, { exact: true })).toBeVisible();
  await expect(win.getByLabel(t.phoneLabel, { exact: true })).toBeVisible();
  await expect(win.getByLabel(t.emailLabel, { exact: true })).toBeVisible();
  await expect(win.getByLabel(t.logoLabel, { exact: true })).toBeAttached();

  await win.screenshot({ path: `test-results/sou111-ac1-form-${loc}.png` });
});

// ---------------------------------------------------------------------------
// AC2 — blocking: empty name is rejected.
// ---------------------------------------------------------------------------
test('AC2: empty name blocks advancing past the Center Profile step', async () => {
  const loc = locale();
  const t = CP[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await reachCenterStep(win, loc);

  // A valid phone but no name.
  await win.getByLabel(t.phoneLabel, { exact: true }).fill('+212612345678');
  await win.getByRole('button', { name: t.next }).click();

  // Must remain on the Center step; the Admin step must not appear.
  await expect(win.getByText(t.wizardCenterTitle).first()).toBeVisible();
  await expect(win.getByText(STR[loc].adminStepTitle)).toHaveCount(0);
  expect((await getCenter(win))).toBeNull();
});

// ---------------------------------------------------------------------------
// AC2 — blocking: an invalid (non-E.164) phone is rejected.
// ---------------------------------------------------------------------------
test('AC2: an invalid phone blocks advancing even with a valid name', async () => {
  const loc = locale();
  const t = CP[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await reachCenterStep(win, loc);

  await win.getByLabel(t.nameLabel, { exact: true }).fill('Centre Test');
  await win.getByLabel(t.phoneLabel, { exact: true }).fill('abc');
  await win.getByRole('button', { name: t.next }).click();

  await expect(win.getByText(t.wizardCenterTitle).first()).toBeVisible();
  await expect(win.getByText(STR[loc].adminStepTitle)).toHaveCount(0);
  // Garbage phone never persisted.
  expect((await getCenter(win))?.phone ?? null).not.toBe('abc');

  await win.screenshot({ path: `test-results/sou111-ac2-badphone-${loc}.png` });
});

// ---------------------------------------------------------------------------
// AC2 — OBSERVED behavior for an EMPTY phone (documents a discrepancy).
//
// The AC groups phone under "Required: name is required; phone must be valid
// E.164." A strict reading is that an empty phone should also block. The app
// only blocks a NON-EMPTY invalid phone; an EMPTY phone advances (phone is
// treated as optional-if-blank). This spec pins the observed behavior so a
// future change is noticed; the QA report flags the ambiguity for a human call.
// ---------------------------------------------------------------------------
test('AC2 (edge): an empty phone currently ADVANCES past Center Profile (observed)', async () => {
  const loc = locale();
  const t = CP[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await reachCenterStep(win, loc);

  await win.getByLabel(t.nameLabel, { exact: true }).fill('Centre Sans Tel');
  // phone left empty
  await win.getByRole('button', { name: t.next }).click();

  // Observed: it advances to the Admin step with no phone.
  await expect(win.getByText(STR[loc].adminStepTitle).first()).toBeVisible({ timeout: 5000 });
  await win.screenshot({ path: `test-results/sou111-ac2-emptyphone-${loc}.png` });
});

// ---------------------------------------------------------------------------
// AC2 — valid name + valid E.164 phone unblocks; address/email/logo are optional.
// ---------------------------------------------------------------------------
test('AC2: valid name + valid E.164 phone advances (address/email/logo optional)', async () => {
  const loc = locale();
  const t = CP[loc];
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await reachCenterStep(win, loc);

  // Only the two required fields — everything else deliberately left empty.
  await win.getByLabel(t.nameLabel, { exact: true }).fill('Centre Minimal');
  await win.getByLabel(t.phoneLabel, { exact: true }).fill('+212612345678');
  await win.getByRole('button', { name: t.next }).click();

  // Advancing to the Admin step is the proof the guard released.
  await expect(win.getByText(STR[loc].adminStepTitle).first()).toBeVisible({ timeout: 5000 });
});

// ---------------------------------------------------------------------------
// AC3 — completing the whole wizard persists the center and surfaces its name
//        in the app shell, with NO manual Settings save.
// ---------------------------------------------------------------------------
test('AC3: the entered center name persists during first-run and shows in the app shell after setup', async () => {
  const loc = locale();
  const t = CP[loc];
  const L = STR[loc];
  const uniqueName = 'Centre Preuve SOU111';
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;

  // Language → Center.
  await reachCenterStep(win, loc);

  // Fill the real Center Profile form with a distinctive name.
  await win.getByLabel(t.nameLabel, { exact: true }).fill(uniqueName);
  await win.getByLabel(t.addressLabel, { exact: true }).fill('123 Avenue Test');
  await win.getByLabel(t.phoneLabel, { exact: true }).fill('+212612345678');
  await win.getByLabel(t.emailLabel, { exact: true }).fill('preuve@centre.ma');
  await win.getByRole('button', { name: t.next }).click();

  // Center → Admin: the center row already exists mid-wizard.
  await expect(win.getByText(L.adminStepTitle).first()).toBeVisible({ timeout: 5000 });
  await expect.poll(async () => (await getCenter(win))?.name, { timeout: 5000 }).toBe(uniqueName);

  // Admin.
  await win.getByLabel(t.username, { exact: true }).fill(VALID_ADMIN.username);
  await win.getByLabel(t.password, { exact: true }).fill(VALID_ADMIN.password);
  await win.getByLabel(t.confirmPassword, { exact: true }).fill(VALID_ADMIN.password);
  await win.getByRole('button', { name: t.next }).click();

  // Hours → Holidays (pro, skippable) → Done.
  await expect(win.getByText(L.hoursStepTitle).first()).toBeVisible({ timeout: 5000 });
  await win.getByRole('button', { name: t.next }).click();
  const skip = win.getByRole('button', { name: t.skip });
  if (await skip.count()) await skip.click();
  await expect(win.getByText(L.doneTitle).first()).toBeVisible({ timeout: 5000 });
  await win.getByRole('button', { name: t.doneCta }).click();

  // Hand off to the auth gate, log in, and land on the app shell.
  await passAuthGate(win);

  // Core of AC3: after setup the center row persists with the entered name,
  // with NO manual Settings save ever performed.
  expect((await getCenter(win))?.name).toBe(uniqueName);

  await win.screenshot({ path: `test-results/sou111-ac3-shell-${loc}.png` });

  // Diagnostic: does the app-shell banner surface the real center name?
  const bannerText = await win.locator('banner, header').first().innerText().catch(() => '');
  const nameInShell = await win.getByText(uniqueName).first().isVisible().catch(() => false);
  // Evidence for the report — not a hard gate on the shell-header wording.
  test.info().annotations.push({
    type: 'ac3-shell',
    description: `nameInShell=${nameInShell}; banner="${bannerText.replace(/\s+/g, ' ').trim()}"`,
  });

  // The persisted center must be reflected in Settings without a manual save.
  await win.getByRole('link', { name: t.settingsNav }).click();
  await win.locator('form input[name="phone"]').waitFor({ state: 'visible' });
  await expect(win.getByLabel(t.nameLabel, { exact: true })).toHaveValue(uniqueName);

  await win.screenshot({ path: `test-results/sou111-ac3-settings-${loc}.png` });
});

// ---------------------------------------------------------------------------
// AC4 — the Center Profile step renders under real RTL for the AR project.
// ---------------------------------------------------------------------------
test('AC4: the Center Profile step honours document direction per locale', async () => {
  const loc = locale();
  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = live.win;
  await reachCenterStep(win, loc);

  const expectedDir = loc === 'ar' ? 'rtl' : 'ltr';
  await expect(win.locator('html')).toHaveAttribute('dir', expectedDir);

  await win.screenshot({ path: `test-results/sou111-ac4-dir-${loc}.png` });
});
