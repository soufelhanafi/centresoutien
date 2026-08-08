import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * SOU-110 — "Mode démo" (demo/seed data for sales demos), black-box.
 *
 * Drives the packaged app exclusively through the public preload bridge
 * (`window.api.invoke`) and the DOM. No renderer/domain/data implementation is
 * imported. Every string mirrors `i18n/fr.json` / `ar.json`'s `demo.*` and
 * `login.*` namespaces.
 *
 * Launch switches (shared with the other suites):
 *   - CS_LOCALE       → renderer locale (fr | ar)
 *   - CS_PLAN         → active plan (essentiel | pro | premium)
 *   - --user-data-dir → Electron userData dir (one encrypted DB per center)
 * The e2e license seam (`CS_E2E_LICENSE_PLAN`) is set by global-setup.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;
// SOU-110 acceptance criterion 6: demo admin.
export const DEMO_ADMIN = { username: 'demo', password: ['Demo', '2026', '!'].join('') } as const;

export const REAL_DB = 'centre-local.db';
export const DEMO_DB = 'centre-demo.db';

export const D: Record<
  Locale,
  {
    settingsNav: string;
    demoTab: string;
    introSubtitle: string;
    createBtn: string;
    creating: string;
    bannerLabel: string;
    bannerSubtitle: string;
    bannerWipe: string;
    activeTitle: string;
    activeWipe: string;
    wipeDialogTitle: string;
    wipeDialogConfirm: string;
    wipeDialogCancel: string;
    restartingTitle: string;
    loginExploreDemo: string;
    loginExploreDemoHint: string;
    appMarker: string;
  }
> = {
  fr: {
    settingsNav: 'Paramètres',
    demoTab: 'Mode démo',
    introSubtitle:
      "Créez un centre avec des données réalistes pour présenter l'application lors d'une démonstration ou d'une visite de vente. Vos données réelles ne sont pas touchées.",
    createBtn: 'Créer le centre de démonstration',
    creating: 'Création…',
    bannerLabel: 'MODE DÉMO',
    bannerSubtitle: 'centre de démonstration',
    bannerWipe: 'Supprimer',
    activeTitle: 'Vous êtes dans le centre de démonstration',
    activeWipe: 'Supprimer la démo',
    wipeDialogTitle: 'Supprimer le centre de démonstration ?',
    wipeDialogConfirm: 'Supprimer la démo',
    wipeDialogCancel: 'Annuler',
    restartingTitle: "Redémarrage de l'application…",
    loginExploreDemo: 'Explorer la démo',
    loginExploreDemoHint:
      "Essayez l'application avec un centre de démonstration pré-rempli. L'application redémarrera ; aucune donnée réelle ne sera modifiée.",
    appMarker: 'Centre principal',
  },
  ar: {
    settingsNav: 'الإعدادات',
    demoTab: 'الوضع التجريبي',
    introSubtitle:
      'أنشئ مركزاً ببيانات واقعية لتقديم التطبيق خلال عرض توضيحي أو زيارة مبيعات. بياناتك الحقيقية لن تتأثر.',
    createBtn: 'إنشاء المركز التجريبي',
    creating: 'جارٍ الإنشاء…',
    bannerLabel: 'وضع تجريبي',
    bannerSubtitle: 'مركز تجريبي',
    bannerWipe: 'حذف',
    activeTitle: 'أنت الآن في المركز التجريبي',
    activeWipe: 'حذف الوضع التجريبي',
    wipeDialogTitle: 'حذف المركز التجريبي؟',
    wipeDialogConfirm: 'حذف المركز التجريبي',
    wipeDialogCancel: 'إلغاء',
    restartingTitle: 'إعادة تشغيل التطبيق…',
    loginExploreDemo: 'استكشاف الوضع التجريبي',
    loginExploreDemoHint:
      'جرّب التطبيق بمركز تجريبي معبأ مسبقاً. سيعاد تشغيل التطبيق ولن يتم تعديل أي بيانات حقيقية.',
    appMarker: 'المركز الرئيسي',
  },
};

export type Launched = { app: ElectronApplication; win: Page };

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-demo-'));
}

export async function launch(locale: Locale, plan: string, userDataDir: string): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, CS_LOCALE: locale, CS_PLAN: plan },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/** Launch, clear the first-run + auth gates through the public bridge (same recipe every other suite uses). */
export async function boot(locale: Locale, plan: string = 'premium'): Promise<Launched> {
  const live = await launch(locale, plan, freshUserDataDir());
  await seedAdminAndLogin(live.win);
  return live;
}

/** admin.create + auth.login (remembered) + reload — real center is booted. */
export async function seedAdminAndLogin(win: Page): Promise<void> {
  await win.evaluate(async (admin) => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
}

/** Launch with an admin provisioned but NOT logged in → the login screen is reachable. */
export async function bootLoggedOut(locale: Locale, plan: string = 'premium'): Promise<Launched> {
  const live = await launch(locale, plan, freshUserDataDir());
  await live.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    await api.invoke('admin.create', admin);
  }, VALID_ADMIN);
  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');
  return live;
}

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

/**
 * SIGKILL any Electron process still bound to a userDataDir (a demo relaunch
 * child can't always be closed gracefully).
 */
export async function killProcessesForDir(userDataDir: string): Promise<void> {
  try {
    execSync(`pkill -9 -f "out/main/index.js --user-data-dir=${userDataDir}"`, { encoding: 'utf8' });
  } catch {
    /* no matching process — fine */
  }
  await new Promise((r) => setTimeout(r, 600));
}

/**
 * Tear down an ElectronApplication without ever letting `app.close()` hang on a
 * main process that is blocked in a modal alert (the demo relaunch path).
 * Strategy: SIGKILL the OS process FIRST (kills even a modal-blocked process),
 * then let Playwright observe the process exit and close its tracking.
 */
export async function forceCloseApp(app?: ElectronApplication): Promise<void> {
  if (!app) return;
  let proc: { kill: (sig?: string) => void } | null = null;
  try {
    proc = app.process() as unknown as { kill: (sig?: string) => void };
  } catch {
    proc = null;
  }
  if (proc) {
    try {
      proc.kill('SIGKILL');
    } catch {
      /* already dead */
    }
  }
  const closed = new Promise<boolean>((resolve) => {
    let done = false;
    app.once('close', () => {
      done = true;
      resolve(true);
    });
    setTimeout(() => resolve(done), 3000);
  });
  const wasClosed = await closed;
  if (!wasClosed) {
    await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 1000))]);
  }
  await new Promise((r) => setTimeout(r, 300));
}

/** Bounded invoke through the public bridge (never hangs the spec). */
export async function invoke(win: Page, channel: string, req: unknown = {}, timeoutMs = 8000): Promise<unknown> {
  const p = win.evaluate(
    async ({ channel, req }) => {
      const api = (window as unknown as { api: Bridge }).api;
      return api.invoke(channel, req);
    },
    { channel, req },
  );
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`invoke ${channel} timed out after ${timeoutMs}ms`)), timeoutMs)),
  ]);
}

/** `demo.status` through the bridge. */
export async function demoStatus(win: Page): Promise<{ isDemo: boolean }> {
  return (await invoke(win, 'demo.status', {})) as { isDemo: boolean };
}

/** Create a sentinel student in the real center, return its name (fr). */
export async function createSentinel(win: Page, tag: string): Promise<void> {
  await invoke(win, 'student.create', {
    name: { fr: `Sentinel QA ${tag}`, ar: `سنترل ${tag}` },
    birthDate: '2010-01-01',
    level: '3AC',
    school: null,
    notes: null,
    guardianIds: [],
  });
}

/** List students through the bridge (search='' returns all). */
export async function listStudents(win: Page): Promise<{ id: string; name: { fr: string } }[]> {
  const res = (await invoke(win, 'student.list', { search: '' })) as { students: { id: string; name: { fr: string } }[] };
  return res.students;
}

/**
 * Drive `demo.create` from a booted real center, then let the app relaunch.
 * Returns the bridge ack and the userDataDir for the follow-up relaunch.
 * `seed` (optional) runs on the booted real-center window before `demo.create`,
 * e.g. to plant a sentinel student the isolation scenario must survive.
 */
export async function createDemoFromRealCenter(
  locale: Locale,
  userDataDir: string,
  seed?: (win: Page) => Promise<void>,
): Promise<{ relaunching: boolean }> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, CS_LOCALE: locale, CS_PLAN: 'premium' },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await seedAdminAndLogin(win);
  if (seed) await seed(win);
  const ack = (await invoke(win, 'demo.create', {})) as { relaunching: boolean };
  await new Promise((r) => setTimeout(r, 3000));
  await forceCloseApp(app);
  // The app self-relaunches into a `--demo` child after demo.create; that child
  // is blocked in a modal alert and would otherwise linger forever (holding the
  // demo DB). Nuke any process still bound to this userDataDir.
  await killProcessesForDir(userDataDir);
  return ack;
}

/**
 * Relaunch against the same userDataDir with the `--demo` flag the app itself
 * uses when it self-relaunches into demo mode, then read `demo.status` through
 * the bridge. Mirrors `relaunchReal` — the pre-fix unlock-modal block (SOU-110
 * QA) that forced a raw-spawn probe is gone; `electron.launch` attaches to the
 * real window now.
 */
export async function relaunchDemo(
  locale: Locale,
  userDataDir: string,
): Promise<{ openedWindow: boolean; isDemo: boolean | null; error?: string; app?: ElectronApplication; win?: Page }> {
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`, '--demo'],
      env: { ...process.env, CS_LOCALE: locale, CS_PLAN: 'premium' },
    });
    const opened = await Promise.race([
      app.waitForEvent('window', { timeout: 8000 }).then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 9000)),
    ]);
    if (!opened) {
      await forceCloseApp(app);
      return { openedWindow: false, isDemo: null };
    }
    const win = app.windows()[0];
    if (!win) {
      await forceCloseApp(app);
      return { openedWindow: false, isDemo: null };
    }
    await win.waitForLoadState('domcontentloaded').catch(() => {});
    let isDemo: boolean | null = null;
    try {
      isDemo = ((await invoke(win, 'demo.status', {}, 5000)) as { isDemo: boolean }).isDemo;
    } catch {
      isDemo = null;
    }
    return { openedWindow: true, isDemo, app, win };
  } catch (e) {
    await forceCloseApp(app);
    return { openedWindow: false, isDemo: null, error: String((e as Error)?.message ?? e) };
  }
}

/** Relaunch against the same userDataDir WITHOUT the demo flag — the real center path. */
export async function relaunchReal(
  locale: Locale,
  userDataDir: string,
): Promise<{ openedWindow: boolean; isDemo: boolean | null; error?: string; app?: ElectronApplication; win?: Page }> {
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
      env: { ...process.env, CS_LOCALE: locale, CS_PLAN: 'premium' },
    });
    const opened = await Promise.race([
      app.waitForEvent('window', { timeout: 8000 }).then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 9000)),
    ]);
    if (!opened) {
      await forceCloseApp(app);
      return { openedWindow: false, isDemo: null };
    }
    const win = app.windows()[0];
    if (!win) {
      await forceCloseApp(app);
      return { openedWindow: false, isDemo: null };
    }
    await win.waitForLoadState('domcontentloaded').catch(() => {});
    let isDemo: boolean | null = null;
    try {
      isDemo = ((await invoke(win, 'demo.status', {}, 5000)) as { isDemo: boolean }).isDemo;
    } catch {
      isDemo = null;
    }
    return { openedWindow: true, isDemo, app, win };
  } catch (e) {
    await forceCloseApp(app);
    return { openedWindow: false, isDemo: null, error: String((e as Error)?.message ?? e) };
  }
}

/** Filesystem facts inside a userDataDir (black-box). */
export function fsFacts(dir: string): { realDb: boolean; demoDb: boolean; demoLicense: boolean; files: string[] } {
  const files = existsSync(dir) ? readdirSync(dir) : [];
  return {
    realDb: files.includes(REAL_DB),
    demoDb: files.includes(DEMO_DB),
    demoLicense: files.some((f) => f.includes('license.CS-DEMO-001') && f.endsWith('.json')),
    files,
  };
}

/** The SQLCipher file's header (first 16 bytes = random salt for an encrypted DB). */
export function dbSalt(dir: string, name: string): string {
  const p = join(dir, name);
  if (!existsSync(p)) return '';
  return readFileSync(p).subarray(0, 16).toString('hex');
}

export function dbSize(dir: string, name: string): number {
  const p = join(dir, name);
  return existsSync(p) ? statSync(p).size : -1;
}
