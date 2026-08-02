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
  launchWithDbKey,
  listBackupFiles,
  pickDestinationFolder,
  pickRestoreFile,
  setupCenter,
  waitForAppQuit,
  type Launched,
  type Locale,
} from './backup.fixtures';

/**
 * SOU-102 — Backup & restore (encrypted DB export/import + scheduled local
 * backups), black-box.
 *
 * Acceptance under test:
 *   1. Restore of a backup on a fresh install yields a fully working center.
 *   2. Corrupted/wrong-key backup fails safely with a clear FR/AR message,
 *      and NEVER touches/destroys the current live DB.
 *
 * Plus the supporting flows named in the ticket: manual backup happy path
 * and scheduled-backup retention pruning.
 *
 * Scope decisions carried over from the ticket (not defects):
 *   - DB key comes from the dev env var CS_DB_KEY, not a real passphrase UI.
 *   - Only one center DB is open at a time (no multi-center switcher yet).
 *   - The native folder/file picker is a real OS dialog; these specs stub
 *     `dialog.showOpenDialog` in the Electron main process via
 *     `ElectronApplication.evaluate` — the standard Playwright-Electron
 *     technique — instead of driving an unautomatable native dialog.
 *   - Scheduled backups only run via an on-launch check; there is no way to
 *     drive that from the UI/bridge without a real >24h clock gap, so the
 *     scheduled-trigger path itself is out of scope for these specs (noted
 *     as blocked in the QA report, not asserted here).
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
// Scenario 1 — empty state
// ---------------------------------------------------------------------------

test('Scenario 1 — empty state: no destination configured, no backup ever run, actions disabled', async () => {
  const loc = locale();
  const t = BK[loc];
  liveA = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = liveA.win;
  await setupCenter(win, loc, 'Centre Vide');
  const panel = await gotoBackupTab(win, loc);

  await expect(panel.getByText(t.destinationLabel)).toBeVisible();
  await expect(panel.getByPlaceholder(t.destinationPlaceholder)).toBeVisible();
  await expect(panel.getByText(t.lastBackupNever)).toBeVisible();
  await expect(panel.getByRole('button', { name: t.backupNowBtn })).toBeDisabled();
  await expect(panel.getByRole('button', { name: t.restoreBtn, exact: true })).toBeDisabled();

  await win.screenshot({ path: `test-results/backup-empty-state-${loc}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 2 — manual backup happy path
// ---------------------------------------------------------------------------

test('Scenario 2 — manual backup: picking a folder and backing up now creates an encrypted snapshot file', async () => {
  const loc = locale();
  const t = BK[loc];
  const backupDir = mkdtempSync(join(tmpdir(), 'cs-backup-manual-'));
  liveA = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = liveA.win;
  await setupCenter(win, loc, 'Centre Manuel');
  const panel = await gotoBackupTab(win, loc);

  await pickDestinationFolder(liveA.app, win, loc, panel, backupDir);
  await expect(panel.locator('input[readonly]')).toHaveValue(backupDir);
  await expect(panel.getByRole('button', { name: t.backupNowBtn })).toBeEnabled();

  await backupNow(win, loc, panel);
  await expect(win.getByText(new RegExp(`^${t.toastBackupCreatedPrefix}`))).toBeVisible();

  const files = listBackupFiles(backupDir);
  expect(files).toHaveLength(1);
  expect(files[0]).toMatch(/^backup-.+\.db$/);

  // Persist the config too, via the explicit Enregistrer/حفظ action.
  await panel.getByRole('button', { name: t.saveBtn }).click();
  await expect(win.getByText(t.toastConfigSaved)).toBeVisible();

  await win.screenshot({ path: `test-results/backup-manual-success-${loc}.png` });
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

// ---------------------------------------------------------------------------
// Scenario 5 — wrong-key backup: safe failure, live DB untouched
// ---------------------------------------------------------------------------

test('Scenario 5 — a backup encrypted with a different key fails restore safely and never touches the live DB', async () => {
  const loc = locale();
  const t = BK[loc];
  const backupDir = mkdtempSync(join(tmpdir(), 'cs-wrongkey-'));

  // A backup produced by an instance using a DIFFERENT SQLCipher key.
  const keyed = await launchWithDbKey({ locale: loc, userDataDir: freshUserDataDir(), dbKey: 'a-totally-different-secret-key-999' });
  await setupCenter(keyed.win, loc, 'Centre Keyed Differently');
  const panelKeyed = await gotoBackupTab(keyed.win, loc);
  await pickDestinationFolder(keyed.app, keyed.win, loc, panelKeyed, backupDir);
  await backupNow(keyed.win, loc, panelKeyed);
  const files = listBackupFiles(backupDir);
  expect(files).toHaveLength(1);
  const wrongKeyBackupPath = backupFilePath(backupDir, files[0]!);
  await keyed.app.close();

  // Restoring it into a normal (default-key) instance must fail safely.
  liveA = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = liveA.win;
  await setupCenter(win, loc, 'Centre Live Untouched Two');
  const panel = await gotoBackupTab(win, loc);

  await pickRestoreFile(liveA.app, win, loc, panel, wrongKeyBackupPath);
  await confirmRestore(win, loc, panel);

  await expect(win.getByText(t.errMismatch)).toBeVisible();

  await win.getByRole('tab', { name: loc === 'ar' ? 'الملف الشخصي' : 'Profil' }).click();
  const nameInput = win.getByLabel(CP[loc].nameLabel, { exact: true });
  await expect(nameInput).toHaveValue('Centre Live Untouched Two');

  await win.screenshot({ path: `test-results/backup-wrong-key-${loc}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 6 — missing backup file: distinct, clear "not found" message
// ---------------------------------------------------------------------------

test('Scenario 6 — a backup file that no longer exists on disk fails with a distinct "not found" message', async () => {
  const loc = locale();
  const t = BK[loc];
  const dir = mkdtempSync(join(tmpdir(), 'cs-missing-'));
  const missingPath = join(dir, 'does-not-exist.db');

  liveA = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = liveA.win;
  await setupCenter(win, loc, 'Centre Missing File Test');
  const panel = await gotoBackupTab(win, loc);

  await pickRestoreFile(liveA.app, win, loc, panel, missingPath);
  await confirmRestore(win, loc, panel);

  await expect(win.getByText(t.errNotFound)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 7 — retention pruning
// ---------------------------------------------------------------------------

test('Scenario 7 — retention pruning: creating more backups than the retention count prunes the oldest', async () => {
  const loc = locale();
  const t = BK[loc];
  const backupDir = mkdtempSync(join(tmpdir(), 'cs-retention-'));
  liveA = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const win = liveA.win;
  await setupCenter(win, loc, 'Centre Retention');
  const panel = await gotoBackupTab(win, loc);

  await pickDestinationFolder(liveA.app, win, loc, panel, backupDir);
  await panel.locator('input[name="retentionCount"]').fill('2');
  await panel.getByRole('button', { name: t.saveBtn }).click();
  await expect(win.getByText(t.toastConfigSaved)).toBeVisible();

  // Four manual backups, retention configured to keep only 2.
  for (let i = 0; i < 4; i++) {
    await backupNow(win, loc, panel);
  }

  const files = listBackupFiles(backupDir);
  await win.screenshot({ path: `test-results/backup-retention-${loc}.png` });
  expect(files).toHaveLength(2);
});
