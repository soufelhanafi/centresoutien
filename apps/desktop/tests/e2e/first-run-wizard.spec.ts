import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  VALID_ADMIN,
  adminExists,
  freshUserDataDir,
  launch,
  passAuthGate,
  trySecondAdminCreate,
  type Launched,
  type Locale,
} from './wizard.fixtures';

/**
 * SOU-25 — First-run wizard flow (state machine), black-box.
 *
 * Critical-only per SOU-142: kept scenarios are the full happy path (proves
 * the admin is created exactly once and the whole step chain hands off to the
 * app) and the first-run gate surviving a relaunch — genuine cross-process
 * territory. Mandatory-data guard, Pro-plan holiday skip variant, the
 * quit-before-admin restart case, and back-navigation retention are lower
 * risk and better covered as unit tests of the wizard state machine.
 *
 * Each `test` launches its own packaged Electron app against a fresh userData
 * dir, so first-run state is guaranteed. Runs under both the `fr` and `ar`
 * projects.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

// ---- step helpers (UI only) ---------------------------------------------------

function next(win: Page, L: Record<string, string>) {
  return win.getByRole('button', { name: L.next });
}
function skip(win: Page, L: Record<string, string>) {
  return win.getByRole('button', { name: L.skip });
}
function languageRadio(win: Page, L: Record<string, string>, loc: Locale) {
  return win.getByRole('radio', { name: loc === 'fr' ? L.langFr : L.langAr });
}

async function fillAdmin(win: Page, L: Record<string, string>) {
  await win.getByLabel(L.username, { exact: true }).fill(VALID_ADMIN.username);
  await win.getByLabel(L.password, { exact: true }).fill(VALID_ADMIN.password);
  await win.getByLabel(L.confirmPassword, { exact: true }).fill(VALID_ADMIN.password);
}

// The Center Profile step is real and blocking (SOU-111): name + valid phone are
// required before Continue advances. Fills the minimum to move past it.
//
// Types L.appMarker as the center name: since SOU-113 the app-shell header
// renders the real persisted center name (no longer a static placeholder), so
// the post-wizard `appMarker` assertions must match what was actually typed here.
async function fillCenter(win: Page, L: Record<string, string>) {
  await win.getByLabel(L.centerName, { exact: true }).fill(L.appMarker);
  await win.getByLabel(L.centerPhone, { exact: true }).fill('+212612345678');
}

async function expectStep(win: Page, title: string) {
  await expect(win.getByText(title, { exact: false }).first()).toBeVisible();
}

// ---- scenarios ----------------------------------------------------------------

test('happy path: walks every mandatory step to Done and creates the admin exactly once (Essentiel)', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await launch({ locale: loc, plan: 'essentiel', userDataDir: freshUserDataDir() });
  const win = live.win;

  // First-run gate opened the wizard; no admin persisted yet.
  await expect(win.getByText(L.wizardTitle).first()).toBeVisible();
  expect(await adminExists(win)).toBe(false);
  // Holidays is available on every plan since SOU-30, including Essentiel.
  await expect(win.getByText(L.stepHolidaysLabel).first()).toBeVisible();

  // 1. Language
  await expectStep(win, L.languageStepTitle);
  await languageRadio(win, L, loc).check();
  await next(win, L).click();

  // 2. Center Profile — real, mandatory step (SOU-111); persists the center row.
  await expectStep(win, L.centerStepTitle);
  await fillCenter(win, L);
  await next(win, L).click();

  // 3. Admin Account — persists the admin account.
  await expectStep(win, L.adminStepTitle);
  expect(await adminExists(win)).toBe(false);
  await fillAdmin(win, L);
  await next(win, L).click();

  // 4. Hours (stub) — reaching it proves the admin was created.
  await expectStep(win, L.hoursStepTitle);
  await expect.poll(() => adminExists(win)).toBe(true);
  await next(win, L).click();

  // 5. Holidays (optional, present on every plan since SOU-30) — skip it.
  await expectStep(win, L.holidaysStepTitle);
  await skip(win, L).click();

  // 6. Done.
  await expect(win.getByText(L.doneTitle).first()).toBeVisible();

  // Exactly once: a second create through the bridge must be rejected.
  const second = await trySecondAdminCreate(win);
  expect(second.created).toBe(false);

  await win.screenshot({ path: `test-results/wizard-done-${loc}.png` });

  // Finishing hands off to the auth gate (SOU-27); logging in reaches the app.
  await win.getByRole('button', { name: L.doneCta }).click();
  await expect(win.getByText(L.wizardTitle)).toHaveCount(0);
  await passAuthGate(win);
  await expect(win.getByText(L.appMarker).first()).toBeVisible();
});

test('first-run gate: fresh state shows the wizard; after completion a relaunch does NOT', async () => {
  const loc = locale();
  const L = STR[loc];
  const dir = freshUserDataDir();

  // Fresh launch → wizard.
  live = await launch({ locale: loc, plan: 'essentiel', userDataDir: dir });
  let win = live.win;
  await expect(win.getByText(L.wizardTitle).first()).toBeVisible();

  // Complete the wizard end to end.
  await languageRadio(win, L, loc).check();
  await next(win, L).click(); // language → center
  await fillCenter(win, L);
  await next(win, L).click(); // center → admin
  await fillAdmin(win, L);
  await next(win, L).click(); // creates admin
  await expectStep(win, L.hoursStepTitle);
  await next(win, L).click(); // hours → holidays
  await expectStep(win, L.holidaysStepTitle);
  await skip(win, L).click(); // holidays (optional) → done
  await expect(win.getByText(L.doneTitle).first()).toBeVisible();
  await win.getByRole('button', { name: L.doneCta }).click();
  await passAuthGate(win);
  await expect(win.getByText(L.appMarker).first()).toBeVisible();
  await live.app.close();

  // Relaunch the SAME userData dir → admin exists + remembered session → app,
  // not the wizard and not the login screen.
  live = await launch({ locale: loc, plan: 'essentiel', userDataDir: dir });
  win = live.win;
  await expect.poll(() => adminExists(win)).toBe(true);
  await expect(win.getByText(L.appMarker).first()).toBeVisible();
  await expect(win.getByText(L.wizardTitle)).toHaveCount(0);
});
