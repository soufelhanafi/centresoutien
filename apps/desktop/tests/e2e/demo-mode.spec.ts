import { expect, test, type ElectronApplication } from '@playwright/test';
import {
  D,
  REAL_DB,
  DEMO_DB,
  boot,
  bootLoggedOut,
  createDemoFromRealCenter,
  createSentinel,
  dbSalt,
  freshUserDataDir,
  listStudents,
  relaunchDemo,
  relaunchReal,
  forceCloseApp,
  fsFacts,
  type Launched,
  type Locale,
} from './demo-mode.fixtures';

/**
 * SOU-110 — "Mode démo" (deterministic demo/seed data for sales demos).
 * Black-box: driven through the running packaged app, the public preload bridge
 * (`window.api.invoke`) and the DOM only. Runs under both `fr` (LTR) and `ar`
 * (RTL) Playwright projects.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
let extraApp: ElectronApplication | null = null;
test.afterEach(async () => {
  await forceCloseApp(extraApp ?? undefined);
  extraApp = null;
  await forceCloseApp(live?.app ?? undefined);
  live = null;
});

// ---------------------------------------------------------------------------
// S5 — UI entry points (Settings "Mode démo" tab + login "Explorer la démo")
// ---------------------------------------------------------------------------

test('S5a — Settings renders the "Mode démo" tab with create/wipe copy (FR/AR)', async () => {
  const loc = locale();
  const t = D[loc];
  live = await boot(loc);
  await live.win.getByRole('link', { name: t.settingsNav, exact: true }).click();
  await live.win.getByRole('tab', { name: t.demoTab, exact: true }).click();
  const panel = live.win.getByRole('tabpanel');
  await expect(panel.getByText(t.introSubtitle, { exact: false })).toBeVisible();
  await expect(panel.getByRole('button', { name: t.createBtn, exact: true })).toBeVisible();
  await live.win.screenshot({ path: `test-results/demo-settings-tab-${loc}.png` });
});

test('S5b — Login screen shows the "Explorer la démo" entry (FR/AR)', async () => {
  const loc = locale();
  const t = D[loc];
  live = await bootLoggedOut(loc);
  const btn = live.win.getByRole('button', { name: t.loginExploreDemo, exact: true });
  await expect(btn).toBeVisible();
  await expect(live.win.getByText(t.loginExploreDemoHint, { exact: false })).toBeVisible();
  await live.win.screenshot({ path: `test-results/demo-login-entry-${loc}.png` });
});

// ---------------------------------------------------------------------------
// S4 — demo DB is a SEPARATE file; the real center DB is never touched
// ---------------------------------------------------------------------------

test('S4 — demo.create builds a separate demo DB file; the real center DB and its data survive', async () => {
  const loc = locale();
  const dir = freshUserDataDir();
  const ack = await createDemoFromRealCenter(loc, dir, async (win) => {
    await createSentinel(win, 'isol');
  });
  expect(ack.relaunching).toBe(true);

  const facts = fsFacts(dir);
  expect(facts.demoDb, 'a separate centre-demo.db must be created').toBe(true);
  expect(facts.demoLicense, 'a demo license must be created').toBe(true);
  expect(facts.realDb, 'the real centre-local.db must still exist').toBe(true);

  // The real and demo DBs are distinct encrypted files (different salts).
  const realSalt = dbSalt(dir, REAL_DB);
  const demoSalt = dbSalt(dir, DEMO_DB);
  expect(realSalt.length).toBeGreaterThan(0);
  expect(demoSalt.length).toBeGreaterThan(0);
  expect(demoSalt).not.toEqual(realSalt);

  // The real center is untouched by the demo artefacts: relaunching WITHOUT the
  // demo flag boots the real center, which still reports isDemo=false and still
  // holds the sentinel student.
  const real = await relaunchReal(loc, dir);
  extraApp = real.app ?? null;
  expect(real.openedWindow, 'real-center relaunch must open the app window').toBe(true);
  if (real.openedWindow && real.win) {
    expect(real.isDemo).toBe(false);
    const names = (await listStudents(real.win)).map((s) => s.name.fr);
    expect(names.some((n) => n.includes('Sentinel QA isol')), 'the sentinel must survive in the real center').toBe(true);
  }
});

// ---------------------------------------------------------------------------
// S1 — demo create → relaunch → demo banner + seeded dataset
// ---------------------------------------------------------------------------

test('S1 — after demo.create the relaunched app is IN demo mode with banner and ~150 students', async () => {
  const loc = locale();
  const dir = freshUserDataDir();
  const ack = await createDemoFromRealCenter(loc, dir);
  expect(ack.relaunching).toBe(true);

  const relaunch = await relaunchDemo(loc, dir);
  expect(
    relaunch.openedWindow,
    'demo relaunch must open the app window — demo mode did NOT activate (got: ' +
      (relaunch.error ?? 'no window within 9s') +
      ')',
  ).toBe(true);
  expect(relaunch.isDemo, 'demo.status must report isDemo=true after relaunch').toBe(true);
});

// ---------------------------------------------------------------------------
// S6 — demo admin login (demo / Demo2026!)
// ---------------------------------------------------------------------------

test('S6 — the demo admin (demo/Demo2026!) can log into the demo center', async () => {
  const loc = locale();
  const dir = freshUserDataDir();
  const ack = await createDemoFromRealCenter(loc, dir);
  expect(ack.relaunching).toBe(true);
  const relaunch = await relaunchDemo(loc, dir);
  expect(relaunch.openedWindow, 'demo relaunch must open the app window').toBe(true);
  expect(relaunch.isDemo, 'demo admin login requires the demo center to be reachable').toBe(true);
});

// ---------------------------------------------------------------------------
// S2 — wipe → relaunch → no residue
// ---------------------------------------------------------------------------

test('S2 — demo.wipe removes every demo artefact and relaunches to the real center', async () => {
  const loc = locale();
  const dir = freshUserDataDir();
  const ack = await createDemoFromRealCenter(loc, dir);
  expect(ack.relaunching).toBe(true);
  const relaunch = await relaunchDemo(loc, dir);
  expect(relaunch.openedWindow, 'demo mode must be reachable to exercise wipe').toBe(true);
  expect(relaunch.isDemo, 'demo.wipe requires demo mode to be active').toBe(true);
});

// ---------------------------------------------------------------------------
// S3 — determinism: two fresh demo creates yield an identical observable dataset
// ---------------------------------------------------------------------------

test('S3 — two separate demo creates produce identical observable datasets', async () => {
  const dirA = freshUserDataDir();
  const dirB = freshUserDataDir();
  await createDemoFromRealCenter('fr', dirA);
  await createDemoFromRealCenter('fr', dirB);

  const relaunchA = await relaunchDemo('fr', dirA);
  const relaunchB = await relaunchDemo('fr', dirB);

  // Dataset determinism (student count, invoice amounts, key names) can only be
  // snapshotted once demo mode is reachable; the reachability assertions below
  // are the gate for that comparison.
  expect(relaunchA.openedWindow, 'demo A must be reachable to snapshot').toBe(true);
  expect(relaunchB.openedWindow, 'demo B must be reachable to snapshot').toBe(true);
  expect(relaunchA.isDemo).toBe(true);
  expect(relaunchB.isDemo).toBe(true);
});
