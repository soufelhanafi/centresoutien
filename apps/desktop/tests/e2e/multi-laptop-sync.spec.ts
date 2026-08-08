import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  startHub,
  launchDevice,
  createSubject,
  renameSubjectFr,
  listSubjectNamesFr,
  runSync,
  closeAll,
  type Locale,
  type Device,
  type Hub,
} from './multi-laptop-sync.fixtures';

/**
 * SOU-82 — Multi-laptop end-to-end sync test. Two REAL Electron app instances
 * (devices A/B) sync a scripted sequence of writes against a bare standalone
 * hub and must reach identical final state. Runs under both the `fr` and `ar`
 * Playwright projects.
 *
 * This is the acknowledged gap SOU-90/SOU-91 left open: SOU-90 converged two
 * SIMULATED devices at the Vitest layer, and SOU-91 SEEDED a conflict directly.
 * Here the conflict is produced by an ACTUAL pull → resolve → push race between
 * two running apps and resolved through the real popup UI on the second syncer.
 */

const locale = () => test.info().project.name as Locale;

let hub: Hub | null = null;
let devA: Device | null = null;
let devB: Device | null = null;

test.beforeEach(() => {
  // Three Electron processes + provisioning + reloads — well past the 30s default.
  test.setTimeout(120_000);
});

test.afterEach(async () => {
  await closeAll(devB, devA, hub);
  devA = devB = hub = null;
});

async function openSyncPage(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await expect(win.getByRole('navigation', { name: L.navAria })).toBeVisible();
  await win.getByRole('link', { name: L.nav, exact: true }).click();
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
}

test('non-overlapping writes on two devices converge to identical state', async () => {
  const loc = locale();
  hub = await startHub();
  devA = await launchDevice(loc, hub.port, 'devA');
  devB = await launchDevice(loc, hub.port, 'devB');

  // Each device creates a DIFFERENT subject, then syncs — no field ever clashes.
  await createSubject(devA.win, 'Alpha', 'ألفا');
  const pushA = await runSync(devA.win);
  expect(pushA?.pushed).toBeGreaterThanOrEqual(1);

  await createSubject(devB.win, 'Beta', 'بيتا');
  const syncB = await runSync(devB.win);
  expect(syncB?.applied).toBeGreaterThanOrEqual(1); // pulled Alpha
  expect(syncB?.pushed).toBeGreaterThanOrEqual(1); // pushed Beta
  expect(syncB?.conflicts).toHaveLength(0);

  // A's second sync pulls Beta; both replicas now hold both subjects.
  await runSync(devA.win);

  const namesA = (await listSubjectNamesFr(devA.win)).sort();
  const namesB = (await listSubjectNamesFr(devB.win)).sort();
  expect(namesA).toEqual(['Alpha', 'Beta']);
  expect(namesB).toEqual(['Alpha', 'Beta']);
});

test('a real same-field clash surfaces in the popup and resolves to convergence', async () => {
  const loc = locale();
  const L = STR[loc];
  hub = await startHub();
  devA = await launchDevice(loc, hub.port, 'devA');
  devB = await launchDevice(loc, hub.port, 'devB');

  // Both devices start holding the same subject at the same version.
  const gammaId = await createSubject(devA.win, 'Gamma', 'غاما');
  await runSync(devA.win);
  await runSync(devB.win); // B pulls Gamma at version 1

  // Each renames the SAME field from that shared base. A syncs first (hub → v2).
  await renameSubjectFr(devA.win, gammaId, 'Gamma A', 'غاما أ');
  const pushA = await runSync(devA.win);
  expect(pushA?.pushed).toBeGreaterThanOrEqual(1);

  await renameSubjectFr(devB.win, gammaId, 'Gamma B', 'غاما ب');
  const clash = await runSync(devB.win); // B is the second syncer — it resolves
  expect(clash?.conflicts).toHaveLength(1);
  expect(clash?.pushed).toBe(0); // the clash blocks the push

  // Surface + resolve through the real popup UI on B (reload so the durable
  // inbox refetches the freshly-blocked clash).
  await devB.win.reload();
  await devB.win.waitForLoadState('domcontentloaded');
  await openSyncPage(devB.win, L);
  if (loc === 'ar') await expect(devB.win.locator('html')).toHaveAttribute('dir', 'rtl');

  await devB.win.getByRole('button', { name: L.openPopup }).click();
  const dialog = devB.win.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: L.popupTitle })).toBeVisible();
  await dialog.getByRole('button', { name: L.takeMine }).click();

  // Push the resolution, then let A pull it. Both converge on the human's choice.
  const pushResolution = await runSync(devB.win);
  expect(pushResolution?.pushed).toBeGreaterThanOrEqual(1);
  await runSync(devA.win);

  const namesA = await listSubjectNamesFr(devA.win);
  const namesB = await listSubjectNamesFr(devB.win);
  expect(namesA).toEqual(['Gamma B']);
  expect(namesB).toEqual(['Gamma B']);
});
