import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { CP } from './center-profile.fixtures';
import { MAIN_ENTRY, VALID_ADMIN, type Launched, type Locale } from './wizard.fixtures';

/**
 * SOU-102 — Backup & restore, black-box E2E fixtures.
 *
 * Drives the running app only through the UI, the public preload bridge, and
 * (for the native folder/file pickers, which pop a real OS dialog Playwright
 * cannot drive) `ElectronApplication.evaluate` to stub `dialog.showOpenDialog`
 * in the main process — the standard Playwright-Electron technique for native
 * dialogs. No renderer/domain/adapter source is read or imported.
 */

export { freshUserDataDir, launch, VALID_ADMIN, type Launched, type Locale } from './wizard.fixtures';

/** All user-facing Backup-tab copy the specs assert on (observed on the running app). */
export const BK: Record<
  Locale,
  {
    tab: string;
    destinationLabel: string;
    destinationPlaceholder: string;
    chooseFolderBtn: string;
    retentionLabel: string;
    lastBackupNever: string;
    saveBtn: string;
    backupNowBtn: string;
    restoreHeading: string;
    chooseFileBtn: string;
    restoreBtn: string;
    confirmTitle: string;
    confirmCancel: string;
    toastBackupCreatedPrefix: string;
    toastConfigSaved: string;
    errMismatch: string;
    errNotFound: string;
  }
> = {
  fr: {
    tab: 'Sauvegarde',
    destinationLabel: 'Dossier de destination',
    destinationPlaceholder: 'Aucun dossier choisi',
    chooseFolderBtn: 'Choisir un dossier',
    retentionLabel: 'Nombre de copies conservées',
    lastBackupNever: 'Dernière sauvegarde automatique : Jamais',
    saveBtn: 'Enregistrer',
    backupNowBtn: 'Sauvegarder maintenant',
    restoreHeading: 'Restaurer une sauvegarde',
    chooseFileBtn: 'Choisir un fichier de sauvegarde',
    restoreBtn: 'Restaurer',
    confirmTitle: 'Confirmer la restauration',
    confirmCancel: 'Annuler',
    toastBackupCreatedPrefix: 'Sauvegarde créée',
    toastConfigSaved: 'Configuration de sauvegarde enregistrée',
    errMismatch: 'Ce fichier de sauvegarde ne correspond pas à ce centre.',
    errNotFound: 'Ce fichier de sauvegarde est introuvable.',
  },
  ar: {
    tab: 'النسخ الاحتياطي',
    destinationLabel: 'مجلد الوجهة',
    destinationPlaceholder: 'لم يتم اختيار مجلد',
    chooseFolderBtn: 'اختيار مجلد',
    retentionLabel: 'عدد النسخ المحتفظ بها',
    lastBackupNever: 'آخر نسخة احتياطية تلقائية: أبدًا',
    saveBtn: 'حفظ',
    backupNowBtn: 'إنشاء نسخة احتياطية الآن',
    restoreHeading: 'استعادة نسخة احتياطية',
    chooseFileBtn: 'اختيار ملف نسخة احتياطية',
    restoreBtn: 'استعادة',
    confirmTitle: 'تأكيد الاستعادة',
    confirmCancel: 'إلغاء',
    toastBackupCreatedPrefix: 'تم إنشاء النسخة الاحتياطية',
    toastConfigSaved: 'تم حفظ إعدادات النسخ الاحتياطي',
    errMismatch: 'ملف النسخة الاحتياطية هذا لا يطابق هذا المركز.',
    errNotFound: 'ملف النسخة الاحتياطية هذا غير موجود.',
  },
};

/**
 * Launch with an explicit SQLCipher key override (`CS_DB_KEY`), the documented
 * dev knob for the DB encryption key (per the ticket's scope decision — no
 * per-center passphrase UI yet). Used only for the wrong-key scenario, to
 * produce a backup file genuinely encrypted with a different key than the
 * restoring instance.
 */
export async function launchWithDbKey(opts: { locale: Locale; userDataDir: string; dbKey: string }): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${opts.userDataDir}`],
    env: { ...process.env, CS_LOCALE: opts.locale, CS_PLAN: 'pro', CS_DB_KEY: opts.dbKey },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/**
 * Full first-run wizard + login, parameterized on center name (unlike
 * `completeSetupAndLogin` in center-profile.fixtures, which always uses the
 * fixed "Centre principal"). Needed here because the restore-on-fresh-install
 * scenario must tell two centers apart by name.
 */
export async function setupCenter(win: Page, loc: Locale, centerName: string): Promise<void> {
  const t = CP[loc];
  await win.getByRole('radio', { name: t.langRadio }).check();
  await win.getByRole('button', { name: t.next }).click(); // language -> center
  await win.getByLabel(t.nameLabel, { exact: true }).fill(centerName);
  await win.getByLabel(t.phoneLabel, { exact: true }).fill('+212612345678');
  await win.getByRole('button', { name: t.next }).click(); // center -> admin
  await win.getByLabel(t.username, { exact: true }).fill(VALID_ADMIN.username);
  await win.getByLabel(t.password, { exact: true }).fill(VALID_ADMIN.password);
  await win.getByLabel(t.confirmPassword, { exact: true }).fill(VALID_ADMIN.password);
  await win.getByRole('button', { name: t.next }).click(); // create admin -> done
  await win.getByRole('button', { name: t.doneCta }).click(); // done -> app shell
  await win.evaluate(async (admin) => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await win.reload();
}

/** Navigate to Settings > Backup and return the scoped tabpanel locator. */
export async function gotoBackupTab(win: Page, loc: Locale) {
  await win.getByRole('link', { name: CP[loc].settingsNav }).click();
  await win.getByRole('tab', { name: BK[loc].tab }).click();
  return win.getByRole('tabpanel');
}

/**
 * Stub the native folder picker (main-process `dialog.showOpenDialog`) to
 * deterministically return `path`, then click "choose folder" in the panel.
 */
export async function pickDestinationFolder(app: ElectronApplication, win: Page, loc: Locale, panel: Locator, path: string) {
  await app.evaluate(async ({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as never;
  }, path);
  await panel.getByRole('button', { name: BK[loc].chooseFolderBtn }).click();
}

/** Stub the native file picker to deterministically return `path`, then click "choose backup file". */
export async function pickRestoreFile(app: ElectronApplication, win: Page, loc: Locale, panel: Locator, path: string) {
  await app.evaluate(async ({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as never;
  }, path);
  await panel.getByRole('button', { name: BK[loc].chooseFileBtn }).click();
}

/** Click "Restaurer maintenant"/manual backup and wait briefly for the write + toast. */
export async function backupNow(win: Page, loc: Locale, panel: Locator) {
  await panel.getByRole('button', { name: BK[loc].backupNowBtn }).click();
  await win.waitForTimeout(800);
}

/**
 * Click "Restaurer", then confirm inside the AlertDialog by exact accessible
 * name — NOT `.last()`: the dialog also renders a trailing icon-only close
 * button whose accessible name is the Cancel label (sr-only span), so
 * `.last()` silently hits Cancel instead of Confirm.
 */
export async function confirmRestore(win: Page, loc: Locale, panel: Locator) {
  await panel.getByRole('button', { name: BK[loc].restoreBtn, exact: true }).click();
  const dlg = win.getByRole('dialog');
  await dlg.waitFor({ state: 'visible' });
  await dlg.getByRole('button', { name: BK[loc].restoreBtn, exact: true }).click();
}

/** List backup files in a destination dir, oldest first (ULID suffix sorts lexicographically by time). */
export function listBackupFiles(dir: string): string[] {
  return readdirSync(dir).sort();
}

export function backupFilePath(dir: string, fileName: string): string {
  return join(dir, fileName);
}

/**
 * On a successful restore the whole Electron process quits (a fresh relaunch
 * is required to safely reopen the restored DB) — poll for the app-level
 * `close` event rather than a window event.
 */
export async function waitForAppQuit(app: ElectronApplication, timeoutMs = 8000): Promise<boolean> {
  let closed = false;
  app.once('close', () => {
    closed = true;
  });
  const start = Date.now();
  while (!closed && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 200));
  }
  return closed;
}
