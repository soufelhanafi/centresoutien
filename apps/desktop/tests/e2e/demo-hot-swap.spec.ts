import { expect, test } from '@playwright/test';
import {
  D,
  bootRealCenter,
  createSentinelStudent,
  demoCreate,
  demoDbExists,
  demoStatus,
  demoWipe,
  forceClose,
  hasStudentNamed,
  plantReloadSentinel,
  planId,
  processId,
  readReloadSentinel,
  realDbExists,
  studentCount,
  type BootedReal,
  type Locale,
} from './demo-hot-swap.fixtures';

/**
 * SOU-186 — "Mode démo" is an IN-PROCESS hot-swap.
 *
 * Acceptance criteria under test (black-box, one live window per scenario):
 *  - Switching INTO / OUT of demo mode must NOT restart the OS process and must
 *    NOT do a full BrowserWindow reload — the transition is instant/seamless.
 *  - `demo.create` resolves `{ isDemo: true }`, `demo.wipe` resolves
 *    `{ isDemo: false }`, both AFTER the swap.
 *  - After the swap the renderer shows the swapped center's data (demo center:
 *    premium license, ~150 students). Wiping returns to the real center's data.
 *  - Toggling on/off REPEATEDLY stays stable — no crash, no dev-server death.
 *
 * Every scenario runs under both `fr` (LTR) and `ar` (RTL) Playwright projects.
 */

const locale = () => test.info().project.name as Locale;

let real: BootedReal | null = null;
test.afterEach(async () => {
  await forceClose(real?.app ?? undefined);
  real = null;
});

// ---------------------------------------------------------------------------
// HS1 — create hot-swaps INTO demo in place: same process, same window, and the
// renderer now shows the demo dataset (~150 students, premium).
// ---------------------------------------------------------------------------
test('HS1 — demo.create hot-swaps into demo with NO restart and NO reload', async () => {
  test.setTimeout(120_000);
  const loc = locale();
  real = await bootRealCenter(loc);
  const { app, win, dir } = real;

  // Given: a booted real center with a small dataset and a survivable sentinel.
  await createSentinelStudent(win, 'hs1');
  const realStudents = await studentCount(win);
  expect(realStudents, 'real center starts small').toBeLessThan(50);
  expect(await demoStatus(win)).toBe(false);

  const pidBefore = processId(app);
  await plantReloadSentinel(win, 'hs1-token');
  const windowsBefore = app.windows().length;

  // When: demo.create runs through the public bridge.
  const result = await demoCreate(win);

  // Then: it resolves { isDemo: true } AFTER the swap.
  expect(result, 'demo.create must resolve { isDemo: true } after the swap').toEqual({ isDemo: true });

  // Then: the OS process and the window both survived (no restart, no reload).
  expect(processId(app), 'the OS process must NOT restart (pid unchanged)').toBe(pidBefore);
  expect(win.isClosed(), 'the window must stay open').toBe(false);
  expect(app.windows().length, 'no extra BrowserWindow may be spawned').toBe(windowsBefore);
  expect(
    await readReloadSentinel(win),
    'the window-scoped sentinel must survive — a reload/relaunch would erase it',
  ).toBe('hs1-token');

  // Then: the renderer now belongs to the demo DB — premium plan, ~150 students.
  expect(await demoStatus(win)).toBe(true);
  expect(await planId(win), 'demo center license is premium').toBe('premium');
  const demoStudents = await studentCount(win);
  expect(demoStudents, `demo center seeds ~150 students (got ${demoStudents})`).toBeGreaterThan(100);

  // Then: the demo DB is a separate file; the real DB is untouched on disk.
  expect(demoDbExists(dir), 'a separate demo DB file exists').toBe(true);
  expect(realDbExists(dir), 'the real DB file still exists').toBe(true);

  await win.screenshot({ path: `test-results/hs1-in-demo-${loc}.png` });
});

// ---------------------------------------------------------------------------
// HS2 — wipe hot-swaps back to the REAL center in place: same process/window,
// demo status flips to false, the real dataset (sentinel) is back, demo file gone.
// ---------------------------------------------------------------------------
test('HS2 — demo.wipe hot-swaps back to the real center with NO restart and NO reload', async () => {
  test.setTimeout(120_000);
  const loc = locale();
  real = await bootRealCenter(loc);
  const { app, win, dir } = real;

  // Given: a real center holding a sentinel, then hot-swapped into demo.
  await createSentinelStudent(win, 'hs2');
  await demoCreate(win);
  expect(await demoStatus(win)).toBe(true);
  expect(await hasStudentNamed(win, 'Sentinel QA hs2'), 'sentinel is NOT in the demo dataset').toBe(false);

  const pidBefore = processId(app);
  await plantReloadSentinel(win, 'hs2-token');

  // When: demo.wipe runs through the public bridge.
  const result = await demoWipe(win);

  // Then: it resolves { isDemo: false } AFTER the swap.
  expect(result, 'demo.wipe must resolve { isDemo: false } after the swap').toEqual({ isDemo: false });

  // Then: process + window survived the swap-back.
  expect(processId(app), 'the OS process must NOT restart on wipe').toBe(pidBefore);
  expect(win.isClosed(), 'the window must stay open on wipe').toBe(false);
  expect(await readReloadSentinel(win), 'wipe must not reload the window').toBe('hs2-token');

  // Then: the renderer is back on the real center — status false, sentinel present.
  expect(await demoStatus(win)).toBe(false);
  expect(await hasStudentNamed(win, 'Sentinel QA hs2'), 'the real center sentinel is back after wipe').toBe(true);
  expect(await studentCount(win), 'real center is small again').toBeLessThan(50);

  // Then: demo artefacts removed; the real DB survived the whole cycle.
  expect(demoDbExists(dir), 'the demo DB file is deleted on wipe').toBe(false);
  expect(realDbExists(dir), 'the real DB file survived the whole cycle').toBe(true);
});

// ---------------------------------------------------------------------------
// HS3 — REPEATED toggling stays stable across many cycles: no crash, no reload,
// process alive throughout, and the final state is the real center intact.
// ---------------------------------------------------------------------------
test('HS3 — toggling demo on/off repeatedly stays stable (no crash, no reload)', async () => {
  test.setTimeout(240_000);
  const loc = locale();
  real = await bootRealCenter(loc);
  const { app, win } = real;

  await createSentinelStudent(win, 'hs3');
  const pidBefore = processId(app);
  await plantReloadSentinel(win, 'hs3-token');

  const CYCLES = 3;
  for (let i = 1; i <= CYCLES; i += 1) {
    const created = await demoCreate(win);
    expect(created, `cycle ${i}: create resolves isDemo true`).toEqual({ isDemo: true });
    expect(await demoStatus(win), `cycle ${i}: in demo`).toBe(true);
    expect(await studentCount(win), `cycle ${i}: demo dataset present`).toBeGreaterThan(100);

    const wiped = await demoWipe(win);
    expect(wiped, `cycle ${i}: wipe resolves isDemo false`).toEqual({ isDemo: false });
    expect(await demoStatus(win), `cycle ${i}: back on real`).toBe(false);

    // Invariants that must hold after EVERY cycle.
    expect(processId(app), `cycle ${i}: pid stable`).toBe(pidBefore);
    expect(win.isClosed(), `cycle ${i}: window alive`).toBe(false);
    expect(await readReloadSentinel(win), `cycle ${i}: no reload`).toBe('hs3-token');
  }

  // Final: real center is fully intact after all the churn.
  expect(await hasStudentNamed(win, 'Sentinel QA hs3'), 'real sentinel survived all cycles').toBe(true);
  expect(await studentCount(win)).toBeLessThan(50);
});

// ---------------------------------------------------------------------------
// HS4 — UI-driven, accepted flow (SOU-186 QA Bug B): creating from the Settings
// "Mode démo" tab hot-swaps IN PLACE onto the login screen (the demo DB has no
// remembered session). That login is one-step — the demo creds are pre-filled and
// hinted — so a single "Se connecter" click drops the operator into the demo app
// shell, banner + ~150 students, with no reload anywhere in the transition.
// ---------------------------------------------------------------------------
test('HS4 — Settings create lands on the prefilled demo login; one submit shows the banner (no reload)', async () => {
  test.setTimeout(120_000);
  const loc = locale();
  const t = D[loc];
  real = await bootRealCenter(loc);
  const { win } = real;

  // Given: on the "Mode démo" settings tab, not yet in demo.
  await win.getByRole('link', { name: t.settingsNav, exact: true }).click();
  await win.getByRole('tab', { name: t.demoTab, exact: true }).click();
  const panel = win.getByRole('tabpanel');
  await expect(panel.getByRole('button', { name: t.createBtn, exact: true })).toBeVisible();
  await plantReloadSentinel(win, 'hs4-token');

  // When: clicking "Créer le centre de démonstration".
  await panel.getByRole('button', { name: t.createBtn, exact: true }).click();

  // Then: the swap lands IN PLACE on the demo login — the open center is the demo
  // center, and the one-step demo hint + prefilled username are shown (no reload).
  await expect(
    win.getByText(t.loginDemoPrefillTitle, { exact: false }),
    'the demo login hint must show after the swap lands on login',
  ).toBeVisible({ timeout: 90_000 });
  expect(await demoStatus(win)).toBe(true);
  await expect(
    win.getByRole('textbox', { name: t.usernameLabel }),
    'the demo username must be pre-filled for a one-click sign-in',
  ).toHaveValue('demo');
  expect(await readReloadSentinel(win), 'the swap onto login must not reload the window').toBe('hs4-token');
  await win.screenshot({ path: `test-results/hs4-demo-login-${loc}.png` });

  // When: submitting the prefilled demo login with a single click.
  await win.getByRole('button', { name: t.loginSubmit, exact: true }).click();

  // Then: the demo app shell renders — persistent banner + the ~150-student dataset.
  const banner = win.getByRole('banner').filter({ hasText: t.bannerLabel });
  await expect(banner, 'demo banner must appear after signing in to the demo').toBeVisible({ timeout: 60_000 });
  expect(await readReloadSentinel(win), 'signing in must not reload the window').toBe('hs4-token');
  expect(await demoStatus(win)).toBe(true);
  expect(await studentCount(win), 'demo center seeds ~150 students').toBeGreaterThan(100);
  await win.screenshot({ path: `test-results/hs4-banner-${loc}.png` });
});

// ---------------------------------------------------------------------------
// HS5 — demo entry points render in both locales (Settings tab + login button).
// ---------------------------------------------------------------------------
test('HS5 — Settings tab and login screen expose the demo entry point (FR/AR)', async () => {
  const loc = locale();
  const t = D[loc];
  real = await bootRealCenter(loc);
  const { win } = real;

  // Settings "Mode démo" tab: explainer + create action, no restart wording.
  await win.getByRole('link', { name: t.settingsNav, exact: true }).click();
  await win.getByRole('tab', { name: t.demoTab, exact: true }).click();
  const panel = win.getByRole('tabpanel');
  await expect(panel.getByText(t.introSubtitle, { exact: false })).toBeVisible();
  await expect(panel.getByRole('button', { name: t.createBtn, exact: true })).toBeVisible();

  // Login screen: log out, then the "Explorer la démo" entry is visible with its hint.
  await win.evaluate(async () => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    await api.invoke('auth.logout', {});
  });
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await expect(win.getByRole('button', { name: t.loginExploreDemo, exact: true })).toBeVisible();
});
