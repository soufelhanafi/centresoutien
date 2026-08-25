import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-82 — the multi-laptop end-to-end sync test.
 *
 * Two REAL Electron app instances (devices A and B) sync against a bare
 * {@link HubServer} run as its OWN process (`hub-standalone.ts`, KICKOFF
 * decision 1 — not a third window, not embedded in either app). The apps reach
 * the hub as pure clients via the SOU-82 `CS_SYNC_HUB_URL`/`CS_SYNC_HUB_TOKEN`
 * seam; the hub is a standalone Electron main so it shares the apps' native
 * SQLCipher ABI (a plain-Node process could not load the `.node` binary the
 * `--mode e2e` build compiles for Electron).
 *
 * Only the `--mode e2e` build emits `out/main/hub-standalone.js`; production
 * ships just `index.js`.
 *
 * Entity writes and sync runs go through the app's OWN preload bridge
 * (`window.api.invoke`) — the exact code path the UI forms use — so no
 * renderer/domain/data implementation is imported. Conflict RESOLUTION is driven
 * through the real popup UI (the SOU-82 requirement), on whichever device syncs
 * second.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');
export const HUB_ENTRY = join(dirname, '../../out/main/hub-standalone.js');

export type Locale = 'fr' | 'ar';

export const CENTER_CODE = 'CS-DEV-001';
export const CENTRE = 'local';
export const HUB_TOKEN = ['e2e', 'multi-laptop', 'pairing', 'token'].join('-');

export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** User-facing copy asserted on, mirrored from i18n {fr,ar}.json (`sync.*`). */
export const STR: Record<Locale, { nav: string; navAria: string; title: string; runNow: string; openPopup: string; popupTitle: string; takeMine: string; dir: 'ltr' | 'rtl' }> = {
  fr: {
    nav: 'Synchronisation',
    navAria: 'Navigation principale',
    title: 'Synchronisation',
    runNow: 'Synchroniser',
    openPopup: 'Ouvrir la résolution',
    popupTitle: 'Résolution de conflits',
    takeMine: 'Prendre ma version',
    dir: 'ltr',
  },
  ar: {
    nav: 'المزامنة',
    navAria: 'التنقل الرئيسي',
    title: 'المزامنة',
    runNow: 'مزامنة',
    openPopup: 'فتح الحل',
    popupTitle: 'حل التعارضات',
    takeMine: 'أخذ نسختي',
    dir: 'rtl',
  },
};

// The preload bridge (`window.api`) has no ambient type inside a `page.evaluate`
// callback, which is compiled for the renderer, not this Node-side spec. Every
// helper below narrows `window` to just this bridge shape via a single
// `unknown as { api: Bridge }` cast — the one justified unsafe cast this file uses.
type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

export type Device = { app: ElectronApplication; win: Page; userDataDir: string };
export type SyncResultView = { applied: number; pushed: number; conflicts: readonly unknown[] } | null;

function freshDir(tag: string): string {
  return mkdtempSync(join(tmpdir(), `cs-e2e-${tag}-`));
}

/** An OS-assigned free loopback TCP port (the Playwright worker is plain Node). */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export type Hub = { app: ElectronApplication; port: number; userDataDir: string };

/** Launch the standalone bare hub and wait until it is actually serving. */
export async function startHub(): Promise<Hub> {
  const port = await freePort();
  const userDataDir = freshDir('hub');
  const app = await electron.launch({
    args: [HUB_ENTRY, `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      CS_HUB_STANDALONE_PORT: String(port),
      CS_HUB_BIND_HOST: '127.0.0.1',
      CS_HUB_TOKEN: HUB_TOKEN,
      CS_CENTER_CODE: CENTER_CODE,
      CS_CENTRE: CENTRE,
    },
  });
  await waitForHub(port);
  return { app, port, userDataDir };
}

/** Poll the hub's cursor route until it answers — it binds before it serves. */
async function waitForHub(port: number): Promise<void> {
  const url = `http://127.0.0.1:${port}/hub/v1/${CENTER_CODE}/cursor?deviceId=dev_probe`;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'x-hub-token': HUB_TOKEN } });
      if (response.status === 200) return;
    } catch {
      // not listening yet
    }
    await sleep(100);
  }
  throw new Error(`hub did not start on port ${port} within 10s`);
}

/** Launch one device app as a pure hub client, provision the admin, log in. */
export async function launchDevice(locale: Locale, hubPort: number, tag: string): Promise<Device> {
  const userDataDir = freshDir(tag);
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      CS_LOCALE: locale,
      CS_PLAN: 'premium',
      CS_CENTER_CODE: CENTER_CODE,
      CS_CENTRE: CENTRE,
      CS_SYNC_HUB_URL: `http://127.0.0.1:${hubPort}`,
      CS_SYNC_HUB_TOKEN: HUB_TOKEN,
    },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  return { app, win, userDataDir };
}

/**
 * Save the center profile row through the bridge (SOU-318). The multi-laptop
 * harness seeds only an admin; the join test also needs a CENTER row on the host
 * so it (and its ownership rows) sync to the hub for a joiner to cold-bootstrap.
 */
export async function saveCenterProfile(win: Page, name: string): Promise<void> {
  await win.evaluate(async (centerName) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('center.save', { name: centerName, address: '', phone: '', email: '', logoPath: null });
  }, name);
}

/**
 * Launch a FRESH device with NO hub env and NO pre-seeded admin (SOU-318), so it
 * boots into the real first-run wizard — the surface the "join an existing center"
 * branch is driven through. It inherits the e2e synthetic license, so the wizard
 * shows (not the activation lock) exactly like a licensed second laptop.
 */
export async function launchJoiner(locale: Locale, tag: string): Promise<Device> {
  const userDataDir = freshDir(tag);
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      CS_LOCALE: locale,
      CS_PLAN: 'premium',
      // Deliberately no CS_SYNC_HUB_URL/TOKEN and no CS_CENTRE: a clean first run,
      // so the join branch (not an env-wired client) creates the local replica.
    },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win, userDataDir };
}

/** Create a subject through the bridge (same path the create dialog uses). Returns its id. */
export async function createSubject(win: Page, nameFr: string, nameAr: string): Promise<string> {
  return win.evaluate(async (name) => {
    const api = (window as unknown as { api: Bridge }).api;
    const res = (await api.invoke('subject.create', { name })) as { id: string };
    return res.id;
  }, { fr: nameFr, ar: nameAr });
}

/** Rename a subject's French name through the bridge (same path the edit form uses). */
export async function renameSubjectFr(win: Page, id: string, nameFr: string, nameAr: string): Promise<void> {
  await win.evaluate(async (req) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('subject.update', { id: req.id, name: { fr: req.nameFr, ar: req.nameAr }, active: true });
  }, { id, nameFr, nameAr });
}

/** Every live subject's French name, read through the bridge. */
export async function listSubjectNamesFr(win: Page): Promise<string[]> {
  return win.evaluate(async () => {
    const api = (window as unknown as { api: Bridge }).api;
    const res = (await api.invoke('subject.list', { scope: 'all' })) as {
      subjects: { name: { fr: string } }[];
    };
    return res.subjects.map((s) => s.name.fr);
  });
}

/** Run one pull → resolve → push cycle through the bridge (the button's own call). */
export async function runSync(win: Page): Promise<SyncResultView> {
  return win.evaluate(async () => {
    const api = (window as unknown as { api: Bridge }).api;
    const res = (await api.invoke('sync.run', {})) as { result: SyncResultView };
    return res.result;
  }) as Promise<SyncResultView>;
}

export async function closeAll(...closables: ({ app: ElectronApplication } | null)[]): Promise<void> {
  for (const c of closables) {
    if (c) await c.app.close().catch(() => undefined);
  }
}
