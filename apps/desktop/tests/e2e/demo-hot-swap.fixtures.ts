import { existsSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import {
  D,
  DEMO_DB,
  MAIN_ENTRY,
  REAL_DB,
  fsFacts,
  invoke,
  listStudents,
  seedAdminAndLogin,
  type Launched,
  type Locale,
} from './demo-mode.fixtures';

/**
 * SOU-186 — demo mode is an IN-PROCESS hot-swap (no `app.relaunch`, no
 * `app.exit`, no BrowserWindow reload). Everything below drives ONE running
 * Electron process through the public preload bridge (`window.api.invoke`) and
 * the DOM only — no renderer/domain/main implementation is imported. The whole
 * point of these fixtures is to prove the process AND the window survive the
 * swap, so the helpers capture a process pid and a window-scoped sentinel that a
 * restart or a reload would necessarily destroy.
 *
 * Re-exports the shared strings + primitives from `demo-mode.fixtures` so the
 * two suites stay in lock-step on the `demo.*` / `login.*` copy.
 */
export { D, DEMO_DB, REAL_DB, fsFacts, invoke, listStudents };
export type { Launched, Locale };

export const RELOAD_SENTINEL = '__csHotSwapSentinel';

/** Pairing token for the embedded hub launched under `bootRealCenter({ hubHost: true })` (SOU-190). */
export const HUB_TOKEN = ['e2e', 'hub-host', 'pairing', 'token'].join('-');

/** An OS-assigned free loopback TCP port — the embedded hub binds it at launch. */
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

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-demoswap-'));
}

export type BootedReal = { app: ElectronApplication; win: Page; dir: string };

/**
 * Launch a fresh real center (premium via the global-setup license seam), seed
 * the admin, log in, and return the userDataDir so filesystem-isolation facts
 * can be read. This is the single window that every hot-swap scenario mutates —
 * it must survive create + wipe untouched.
 *
 * With `hubHost: true` the app boots with the embedded LAN hub serving
 * (`CS_HUB_ENABLED` + `CS_HUB_TOKEN` + `CS_HUB_PORT` + `CS_HUB_BIND_HOST`), so
 * `demo.status` reports `isHubHost: true` — the SOU-190 warning precondition.
 */
export async function bootRealCenter(
  locale: Locale,
  opts: { hubHost?: boolean } = {},
): Promise<BootedReal> {
  const dir = freshUserDataDir();
  const env: Record<string, string> = { ...process.env, CS_LOCALE: locale, CS_PLAN: 'premium' };
  if (opts.hubHost) {
    env['CS_HUB_ENABLED'] = '1';
    env['CS_HUB_TOKEN'] = HUB_TOKEN;
    env['CS_HUB_PORT'] = String(await freePort());
    env['CS_HUB_BIND_HOST'] = '127.0.0.1';
  }
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${dir}`],
    env,
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await seedAdminAndLogin(win);
  return { app, win, dir };
}

/** The OS process id backing the Electron app — unchanged across a hot-swap, changed by a relaunch. */
export function processId(app: ElectronApplication): number | undefined {
  try {
    return (app.process() as { pid?: number }).pid;
  } catch {
    return undefined;
  }
}

/**
 * Plant a window-scoped global. A full BrowserWindow reload (or a process
 * relaunch) discards `window`, so reading this value back after the swap is a
 * black-box proof that neither happened. Also stamps `performance` navigation
 * count as a second, independent signal.
 */
export async function plantReloadSentinel(win: Page, token: string): Promise<void> {
  await win.evaluate(
    ({ key, tok }) => {
      (window as unknown as Record<string, unknown>)[key] = tok;
    },
    { key: RELOAD_SENTINEL, tok: token },
  );
}

/** Read the planted sentinel back; `null` means the window was reloaded/replaced. */
export async function readReloadSentinel(win: Page): Promise<string | null> {
  return win.evaluate((key) => {
    const value = (window as unknown as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : null;
  }, RELOAD_SENTINEL);
}

export type SwapResult = { isDemo: boolean };

/**
 * `demo.create` through the bridge. Resolves AFTER the in-process swap with
 * `{ isDemo: true }` (SOU-186). Generous timeout — the swap seeds ~150 students
 * plus invoices and payroll into the fresh demo DB.
 */
export async function demoCreate(win: Page): Promise<SwapResult> {
  return (await invoke(win, 'demo.create', {}, 90_000)) as SwapResult;
}

/** `demo.wipe` through the bridge. Resolves AFTER the swap back with `{ isDemo: false }`. */
export async function demoWipe(win: Page): Promise<SwapResult> {
  return (await invoke(win, 'demo.wipe', {}, 60_000)) as SwapResult;
}

/** `demo.status` through the bridge. */
export async function demoStatus(win: Page): Promise<boolean> {
  return ((await invoke(win, 'demo.status', {}, 8000)) as { isDemo: boolean }).isDemo;
}

/** Active plan id through the public bridge (the same channel the demo swap re-hydrates from). */
export async function planId(win: Page): Promise<string | null> {
  try {
    const plan = (await invoke(win, 'plan.get', {}, 8000)) as { planId?: string } | null;
    return plan?.planId ?? null;
  } catch {
    return null;
  }
}

export async function studentCount(win: Page): Promise<number> {
  return (await listStudents(win)).length;
}

/** Plant a sentinel student in whichever center is currently open. */
export async function createSentinelStudent(win: Page, tag: string): Promise<void> {
  await invoke(win, 'student.create', {
    name: { fr: `Sentinel QA ${tag}`, ar: `سنترل ${tag}` },
    birthDate: '2010-01-01',
    level: '3AC',
    school: null,
    notes: null,
    guardianIds: [],
  });
}

export async function hasStudentNamed(win: Page, needle: string): Promise<boolean> {
  const students = await listStudents(win);
  return students.some((s) => s.name.fr.includes(needle));
}

export function demoDbExists(dir: string): boolean {
  return existsSync(join(dir, DEMO_DB));
}

export function realDbExists(dir: string): boolean {
  return existsSync(join(dir, REAL_DB));
}

/** SIGKILL teardown that never hangs on a modal-blocked main process. */
export async function forceClose(app?: ElectronApplication): Promise<void> {
  if (!app) return;
  try {
    (app.process() as unknown as { kill: (s?: string) => void }).kill('SIGKILL');
  } catch {
    /* already gone */
  }
  await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  await new Promise((r) => setTimeout(r, 200));
}
