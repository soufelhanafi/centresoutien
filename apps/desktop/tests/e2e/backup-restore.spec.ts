import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { CP } from './center-profile.fixtures';
import {
  BK,
  backupFilePath,
  backupNow,
  confirmRestore,
  freshUserDataDir,
  gotoBackupTab,
  launch,
  listBackupFiles,
  pickDestinationFolder,
  pickRestoreFile,
  setupCenter,
  waitForAppQuit,
  type Launched,
  type Locale,
} from './backup.fixtures';

/**
 * SOU-102 — Backup & restore (encrypted DB export/import), black-box.
 *
 * Critical-only per SOU-142: kept scenarios are the two hard invariants —
 * a valid restore yields a fully working center, and a failed restore
 * NEVER touches/destroys the current live DB. Manual-backup happy path,
 * wrong-key/missing-file variants, and retention pruning are lower-risk
 * and better covered at the unit/integration level.
 *
 * Runs under both the `fr` (LTR) and `ar` (RTL) Playwright projects.
 */

const locale = () => test.info().project.name as Locale;

let liveA: Launched | null = null;
let liveB: Launched | null = null;
test.afterEach(async () => {
  await liveA?.app.close().catch(() => {});
  await liveB?.app.close().catch(() => {});
  liveA = null;
  liveB = null;
});

// ---------------------------------------------------------------------------
// Scenario 3 — restore on a fresh install (strongest acceptance criterion)
// ---------------------------------------------------------------------------

test('Scenario 3 — restoring a valid backup into a freshly set-up center replaces its data and yields a fully working center', async () => {
  const loc = locale();
  const t = BK[loc];
  const backupDir = mkdtempSync(join(tmpdir(), 'cs-backup-restore-'));

  // Center A: the "original" center whose data we will restore elsewhere.
  liveA = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  await setupCenter(liveA.win, loc, 'Centre Original Unique');
  const panelA = await gotoBackupTab(liveA.win, loc);
  await pickDestinationFolder(liveA.app, liveA.win, loc, panelA, backupDir);
  await backupNow(liveA.win, loc, panelA);
  const files = listBackupFiles(backupDir);
  expect(files).toHaveLength(1);
  const originalBackupPath = backupFilePath(backupDir, files[0]!);
  await liveA.app.close();
  liveA = null;

  // Center B: a fresh install with different placeholder data.
  const dirB = freshUserDataDir();
  liveB = await launch({ locale: loc, plan: 'pro', userDataDir: dirB });
  await setupCenter(liveB.win, loc, 'Centre Placeholder Fresh Install');
  const panelB = await gotoBackupTab(liveB.win, loc);
  await pickRestoreFile(liveB.app, liveB.win, loc, panelB, originalBackupPath);
  await expect(panelB.getByRole('button', { name: t.restoreBtn, exact: true })).toBeEnabled();

  await confirmRestore(liveB.win, loc, panelB);

  // Acceptance: a successful restore never leaves the app running against a
  // DB it just overwrote out from under itself — the whole process quits and
  // a relaunch against the SAME userData dir is required.
  const quit = await waitForAppQuit(liveB.app);
  expect(quit).toBe(true);
  liveB = null;

  const relaunched = await launch({ locale: loc, plan: 'pro', userDataDir: dirB });
  liveB = relaunched;
  await relaunched.win.waitForTimeout(500);

  // "Fully working center": remembered-device session still logs straight
  // in (no corruption of the auth/session store), and the restored center's
  // OWN profile data (not B's placeholder) is what's now persisted.
  await relaunched.win.getByRole('link', { name: CP[loc].settingsNav }).click();
  await relaunched.win.getByRole('tab', { name: CP[loc].nameLabel === 'Nom du centre' ? 'Profil' : 'الملف الشخصي' }).click();
  const nameInput = relaunched.win.getByLabel(CP[loc].nameLabel, { exact: true });
  await expect(nameInput).toHaveValue('Centre Original Unique');

  await relaunched.win.screenshot({ path: `test-results/backup-restore-success-${loc}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 4 — corrupted backup file: safe failure, live DB untouched
// ---------------------------------------------------------------------------

test('Scenario 4 — a corrupted backup file fails restore safely with a clear message and never touches the live DB', async () => {
  const loc = locale();
  const t = BK[loc];
  const garbageDir = mkdtempSync(join(tmpdir(), 'cs-corrupted-'));
  const garbagePath = join(garbageDir, 'corrupted-backup.db');
  writeFileSync(garbagePath, Buffer.from('this is not a valid sqlite database at all — just garbage bytes'.repeat(30)));

  liveA = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = liveA.win;
  await setupCenter(win, loc, 'Centre Live Untouched');
  const panel = await gotoBackupTab(win, loc);

  await pickRestoreFile(liveA.app, win, loc, panel, garbagePath);
  await confirmRestore(win, loc, panel);

  await expect(win.getByText(t.errMismatch)).toBeVisible();

  // The app must still be running (no quit) and the live DB untouched: the
  // center profile still shows the ORIGINAL name, not blank/corrupted.
  await win.getByRole('tab', { name: loc === 'ar' ? 'الملف الشخصي' : 'Profil' }).click();
  const nameInput = win.getByLabel(CP[loc].nameLabel, { exact: true });
  await expect(nameInput).toHaveValue('Centre Live Untouched');

  await win.screenshot({ path: `test-results/backup-corrupted-${loc}.png` });
});
