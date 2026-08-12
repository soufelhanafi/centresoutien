/// <reference types="vite/client" />
import { join } from 'node:path';
import { app, dialog, BrowserWindow, ipcMain } from 'electron';
import { PLANS, CenterSwitchError } from '@centresoutien/domain';
import type { PlanId, CenterCode } from '@centresoutien/domain';
import { buildContainer, type Container } from './composition-root';
import { MainRuntime } from './main-runtime';
import { CenterHost } from './center/center-host';
import { createMainWindow } from './window';
import { initAutoUpdater } from './updater/auto-updater-service';
import { DATABASE_SCHEMA_AHEAD_MESSAGE, DatabaseSchemaAheadOfAppError } from '../data/sqlite/migration-runner';
import { centreDbFileName, DatabaseKeyMismatchError, ensureDatabaseKeyed } from '../data/sqlite/db';
import { FsCenterDirectory, type CenterSummary } from '../data/sqlite/center-directory';
import { CENTER_CHANGED_EVENT, type CenterChangedEvent } from '../shared/ipc/center-events';
import { hubDbFileName } from '../data/sqlite/hub/hub-store';
import {
  DATABASE_KEY_MESSAGE,
  E2E_FIXED_DB_KEY,
  KeyStoreCorruptError,
  KeyStoreUnavailableError,
  KEY_STORE_FILE_NAME,
  LEGACY_DEV_DB_KEY,
  resolveCenterKey,
  SafeStorageSecretVault,
} from './key-store';
import {
  DEMO_CENTRE_ID,
  demoCenterCode,
  demoCenterSeeded,
  prepareDemoCenter,
  readDemoLogoPath,
  wipeDemoArtefacts,
} from './demo/demo-center';
import { demoAdminCredentials, demoAdminCredentialsOrNull } from './demo/demo-admin-credentials';
import { sweepStaleTempPdfs } from '../data/fs/temp-pdf';

/** argv flag that puts the app into demo mode on relaunch (SOU-110). */
const DEMO_ARG = '--demo';

/**
 * SOU-179: the DB key for `centreId` under the current build — the dev/e2e
 * override first, else the per-center keychain-derived key. A single helper so
 * startup AND `demo.create` derive the SAME key for the same centreId; deriving
 * the demo seed under one path and relaunching under another left the demo DB
 * undecryptable on relaunch (SOU-110 QA regression). `legacyKeys` mirrors the
 * old `devOrE2eKey ? [] : [LEGACY_DEV_DB_KEY]` — the legacy re-key list is only
 * ever offered when no override key is in play.
 */
function centerDbKey(dir: string, centreId: string): { key: string; legacyKeys: readonly string[] } {
  const devOrE2eKey =
    import.meta.env.DEV || __CS_E2E__
      ? (process.env['CS_DB_KEY'] ?? (__CS_E2E__ ? E2E_FIXED_DB_KEY : undefined))
      : undefined;
  const key = devOrE2eKey ?? resolveCenterKey(new SafeStorageSecretVault(join(dir, KEY_STORE_FILE_NAME)), centreId);
  return { key, legacyKeys: devOrE2eKey ? [] : [LEGACY_DEV_DB_KEY] };
}

/**
 * The startup plan fallback used when no valid license resolves. The `CS_PLAN`
 * env override is a local-dev ergonomic only, DEV-gated the same way `plan.set`
 * and the `CS_LICENSE_*` overrides are (SOU-98): `import.meta.env.DEV` is a
 * build-time constant electron-vite replaces with `false` in a packaged build,
 * so production always falls back to `essentiel` and a user cannot self-upgrade
 * by setting the variable.
 */
function activePlanId(): PlanId {
  if (!import.meta.env.DEV) return 'essentiel';
  const requested = process.env['CS_PLAN'];
  return requested && requested in PLANS ? (requested as PlanId) : 'essentiel';
}

let runtime: MainRuntime | null = null;
let host: CenterHost | null = null;
let mainWindow: BrowserWindow | null = null;
let disposeAutoUpdater: (() => void) | null = null;

/**
 * Embedded LAN hub (SOU-90): designated-laptop opt-in until the sync setup
 * ticket lands real configuration. Fail-closed — an invalid token, port, or
 * missing config disables the hub rather than serving on a guessed value. The
 * pairing token is REQUIRED (a LAN-facing listener with a known default token
 * would defeat the whole pairing model), the port must be a valid TCP port, and
 * `CS_HUB_BIND_HOST` selects the LAN interface the listener serves — REQUIRED
 * and non-wildcard (`0.0.0.0`/`::` disable the hub): never expose the hub
 * beyond the local network. The hub host's own replica still
 * syncs through the same SyncHubPort client (over localhost), so these env vars
 * only decide WHO serves — never how the hub machine syncs.
 */
function resolveHubConfig(): { port: number; token: string; bindHost: string } | null {
  if (process.env['CS_HUB_ENABLED'] !== '1') return null;
  const token = process.env['CS_HUB_TOKEN'];
  if (!token) {
    console.warn('[hub] CS_HUB_ENABLED=1 but no CS_HUB_TOKEN set — hub is NOT serving.');
    return null;
  }
  const rawPort = process.env['CS_HUB_PORT'] ?? '4747';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.warn(`[hub] invalid CS_HUB_PORT "${rawPort}" — hub is NOT serving.`);
    return null;
  }
  const bindHost = process.env['CS_HUB_BIND_HOST'];
  if (!bindHost || bindHost === '0.0.0.0' || bindHost === '::') {
    console.warn(
      `[hub] CS_HUB_BIND_HOST must be an explicit non-wildcard LAN interface (got ${JSON.stringify(bindHost ?? '')}) — hub is NOT serving.`,
    );
    return null;
  }
  return { port, token, bindHost };
}

/**
 * Client-only hub (SOU-82): point this device at an EXTERNAL bare hub — another
 * laptop, or the multi-laptop E2E's standalone `HubServer` — without serving one
 * here. Resolved only when this device is NOT itself a hub host (`resolveHubConfig`
 * returned null); a hub host already wires its own client at its own listener.
 * Fail-closed, mirroring `resolveHubConfig`: both `CS_SYNC_HUB_URL` and
 * `CS_SYNC_HUB_TOKEN` are REQUIRED (a client with no pairing token would defeat
 * the hub's per-center auth), and the URL must parse as an http(s) origin. Real
 * pairing UX lands with the sync-setup ticket; this env seam is the opt-in until then.
 */
function resolveHubClientConfig(): { baseUrl: string; token: string } | null {
  const rawUrl = process.env['CS_SYNC_HUB_URL'];
  if (!rawUrl) return null;
  const token = process.env['CS_SYNC_HUB_TOKEN'];
  if (!token) {
    console.warn('[hub] CS_SYNC_HUB_URL set but no CS_SYNC_HUB_TOKEN — this device stays unpaired.');
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    console.warn(`[hub] invalid CS_SYNC_HUB_URL "${rawUrl}" — this device stays unpaired.`);
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    console.warn(`[hub] CS_SYNC_HUB_URL must be http(s) (got ${parsed.protocol}) — this device stays unpaired.`);
    return null;
  }
  return { baseUrl: rawUrl.replace(/\/$/, ''), token };
}

/**
 * Restore (SOU-102) closes the live DB handle as part of its file swap — the
 * only way to reopen it is a fresh process. The short delay lets the IPC
 * response reach the renderer (so it can show "restarting…") before the app
 * exits.
 */
function scheduleRestart(): void {
  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 300);
}

/**
 * Electron main entry (SOU-15). Registers the typed IPC handlers, then opens the
 * hardened window. The composition root — wiring domain use cases to the SQLite
 * adapters and exposing them as IPC handlers — grows from here.
 */
function openWindow(locale: string | undefined): void {
  const preload = join(import.meta.dirname, '../preload/index.js');
  mainWindow = createMainWindow(preload, {
    devUrl: process.env['ELECTRON_RENDERER_URL'],
    indexHtml: join(import.meta.dirname, '../renderer/index.html'),
    ...(locale ? { query: { locale } } : {}),
  });
}

app.whenReady().then(async () => {
  // Dev defaults; real center selection, key management, and license-driven plan
  // arrive with first-run setup and the center switcher. Demo mode (SOU-110) is a
  // fixed centreId ('demo') entered via the `--demo` relaunch flag (or CS_CENTRE=demo
  // in dev).
  try {
    // Stale temp PDFs from earlier runs (SOU-163): best-effort sweep BEFORE any
    // new print can land. The freshness threshold keeps a recently printed file
    // alive while the OS viewer reads it — a file younger than the threshold
    // cannot predate the previous session by more than a few minutes.
    sweepStaleTempPdfs(app.getPath('temp'));
    const hubServer = resolveHubConfig();
    // A hub host already wires its own client at its own listener; only a device
    // that serves no hub can point at an external one (SOU-82).
    const hubClient = hubServer ? null : resolveHubClientConfig();
    const dir = app.getPath('userData');
    const realCentreId = process.env['CS_CENTRE'] ?? 'local';
    const realCenterCode = (process.env['CS_CENTER_CODE'] ?? 'CS-DEV-001') as CenterCode;
    // Demo mode (SOU-110) boots via the `--demo` flag (or CS_CENTRE=demo in dev);
    // SOU-186 makes the demo TOGGLE a runtime hot-swap, but a `--demo` first boot
    // still opens straight into the demo center below.
    const bootIntoDemo = process.argv.includes(DEMO_ARG) || process.env['CS_CENTRE'] === DEMO_CENTRE_ID;

    // Center switcher (SOU-96). The directory scans the userData dir for
    // `centre-*.db`, deriving each center's own key to read its profile in
    // isolation; the demo center is excluded (it has its own hot-swap flow, not a
    // peer to switch between). The `centerSwitch` closures are threaded into every
    // real container so `SwitchCenter`/`center.list` resolve against the live
    // host: `switchTo` drives the same `MainRuntime` hot-swap the demo toggle uses
    // (via `CenterHost`, which adds the installed-center whitelist and the
    // `center.changed` emit); `listCenters` scans anchored on the currently-open
    // center. The demo container gets none of this — it stays isolated (its
    // `center.switch` hits the composition fallback and rejects).
    const directory = new FsCenterDirectory(dir, (id) => centerDbKey(dir, id).key, [DEMO_CENTRE_ID]);
    const centerSwitch = {
      switchTo: (targetCentreId: string): Promise<void> =>
        host
          ? host.swapTo(targetCentreId)
          : Promise.reject(new CenterSwitchError('center switching is not ready')),
      listCenters: (): Promise<readonly CenterSummary[]> =>
        Promise.resolve(directory.list(runtime?.currentCentreId ?? realCentreId)),
    };

    // The single center-open path, reused by first boot, the SOU-186 demo
    // hot-swap, AND the SOU-96 center switch. It re-keys and opens the target
    // center's SQLCipher files, then wires a fresh container for it — re-scoping
    // centerCode, plan, key, hub, and the switcher/demo closures together, which a
    // bare DB-handle swap could not. The demo center keeps its own file, code,
    // license trust anchor (resolved by centreId inside `buildContainer`), plan,
    // and stays out of sync (review s3); every other center re-provisions its own
    // embedded hub across the swap (reviewer m3).
    const openCenter = (centreId: string): Container => {
      const isDemo = centreId === DEMO_CENTRE_ID;
      const centerCode: CenterCode = isDemo
        ? demoCenterCode()
        : centreId === realCentreId
          ? realCenterCode
          : ((directory.peek(centreId)?.centerCode ?? `CS-${centreId.toUpperCase()}`) as CenterCode);
      // SOU-179: `CS_DB_KEY` is a dev/e2e-only override — a release build derives
      // the per-center key from the keychain. Re-key any DB still under a
      // pre-SOU-179 dev key (production passes no legacy keys, so a DB the derived
      // key cannot open fails closed); the hub store shares the center key.
      const { key, legacyKeys } = centerDbKey(dir, centreId);
      ensureDatabaseKeyed(join(dir, centreDbFileName(centreId)), key, legacyKeys);
      ensureDatabaseKeyed(join(dir, hubDbFileName(centreId)), key, legacyKeys);
      return buildContainer({
        centreId,
        centerCode,
        key,
        dir,
        tempDir: app.getPath('temp'),
        planId: activePlanId(),
        appVersion: () => app.getVersion(),
        scheduleRestart,
        // Demo hot-swap closures (SOU-186). Each container's closures know their
        // own center (`isDemo`), so `create` runs only from the real center and
        // `wipe` only from the demo one — the opposite call is a no-op. Both drive
        // the swap through `runtime.swapTo`, which closes the current DB handle and
        // opens the target via this same `openCenter`, with NO process restart.
        demo: {
          isDemoCenter: isDemo,
          // SOU-190: whether THIS laptop is the active LAN hub host — the env
          // config intent resolved once at startup (`hubServer !== null`), a stable
          // process-level fact. The demo container never wires a hub, so a demo swap
          // stops the embedded hub for the demo's duration; this flag is what lets
          // the renderer warn teammates' sync is about to be cut before `demo.create`.
          isHubHost: hubServer !== null,
          // The demo login prefill the renderer reads from `demo.status` (SOU-186):
          // the env-provided creds, but only when the OPEN center is the demo one —
          // a real center never leaks them. Null when the env vars are unset.
          login: () => (isDemo ? demoAdminCredentialsOrNull() : null),
          create: async () => {
            if (isDemo) return;
            // Fail loud BEFORE any seeding if the demo credentials are unset —
            // demo mode is unavailable without them; the rest of the app is fine.
            const admin = demoAdminCredentials();
            const demoKey = centerDbKey(dir, DEMO_CENTRE_ID).key;
            // Always (re)seed on entry rather than trusting an existing seeded
            // marker: prepareDemoCenter wipes any previous demo artefacts then
            // seeds the deterministic dataset from scratch. This is what makes the
            // wipe's best-effort cleanup safe — a prior wipe that failed to delete
            // a locked demo DB cannot make the next entry reopen that stale session
            // (Greptile P1). Seeding is deterministic, so re-entry is byte-identical.
            await prepareDemoCenter({
              dir,
              tempDir: app.getPath('temp'),
              demoKey,
              appVersion: () => app.getVersion(),
              scheduleRestart,
              admin,
            });
            await runtime?.swapTo(() => openCenter(DEMO_CENTRE_ID));
          },
          wipe: async () => {
            if (!isDemo) return;
            // Resolve the demo logo path from the still-open demo DB BEFORE the
            // swap disposes it, so the artefact wipe leaves zero residue (review m2).
            const logoPath = runtime ? readDemoLogoPath(runtime.currentDb) : null;
            await runtime?.swapTo(() => openCenter(realCentreId));
            // The swap already returned us to the real center — that is the
            // user-visible outcome the renderer rehydrates against. A failure to
            // delete leftover demo artefacts (a busy/locked file) must NOT reject
            // this mutation, or the renderer would stay in demo mode while main
            // serves real data. Best-effort cleanup; the next demo create wipes any
            // previous demo artefacts before seeding, so leftovers self-heal.
            try {
              wipeDemoArtefacts(dir, logoPath);
            } catch (error) {
              console.warn('[demo] artefact cleanup after wipe failed (retried on next create):', error);
            }
          },
        },
        // The demo container never joins sync (review s3): hosting a hub could
        // collide with the real hub's port/token and expose demo data on the LAN;
        // being a client would pull real data into a session meant to be disposable.
        // hubServer/hubClient stay mutually exclusive (SOU-82) whenever demo isn't.
        // The switcher is likewise off in demo — the demo center stays isolated.
        ...(isDemo
          ? {}
          : { centerSwitch, ...(hubServer ? { hubServer } : hubClient ? { hubClient } : {}) }),
      });
    };

    // First open of a fresh demo DB (no seeded marker): build + seed it now, so
    // the window opens onto a fully-populated demo center on a `--demo` boot.
    if (bootIntoDemo) {
      const demoKey = centerDbKey(dir, DEMO_CENTRE_ID).key;
      if (!demoCenterSeeded(dir, demoKey)) {
        await prepareDemoCenter({
          dir,
          tempDir: app.getPath('temp'),
          demoKey,
          appVersion: () => app.getVersion(),
          scheduleRestart,
          admin: demoAdminCredentials(),
        });
      }
    }

    const initial = openCenter(bootIntoDemo ? DEMO_CENTRE_ID : realCentreId);
    runtime = new MainRuntime(ipcMain, initial);
    // The center switcher (SOU-96) is the SECOND trigger of the one MainRuntime
    // hot-swap (the demo toggle is the first): `ipcMain` is wired once by the
    // runtime, and a `center.switch` re-points the live container through the same
    // `swapTo` seam without touching `ipcMain`. `CenterHost` owns only the
    // center-specific concerns on top of that — the installed-center whitelist
    // (Greptile P1 path-traversal guard), the same-center short-circuit, and the
    // `center.changed` emit. The demo center never reaches `swapTo` via the host:
    // it carries no `centerSwitch` wiring, so its `center.switch` hits the
    // composition fallback and rejects, keeping the switcher inert there.
    host = new CenterHost({
      runtime,
      buildForCenter: openCenter,
      listInstalledCentreIds: () =>
        directory.list(runtime?.currentCentreId ?? realCentreId).map((center) => center.centreId),
      emitCenterChanged: (event: CenterChangedEvent) =>
        mainWindow?.webContents.send(CENTER_CHANGED_EVENT, event),
    });
    // `CS_LOCALE` (dev override) wins over the persisted preference (SOU-31); the
    // language tab writes that preference via `preferences.locale.set`, read
    // synchronously here so it survives a restart without waiting on the renderer.
    const locale = process.env['CS_LOCALE'] ?? runtime.readLocalePreference() ?? undefined;
    openWindow(locale);
    // SOU-87: auto-update. Self-guards via app.isPackaged (off in dev/e2e).
    // isMacSigned is false until the macOS Developer ID signing ticket ships —
    // macOS runs check-only and never attempts a (failing) unsigned apply.
    disposeAutoUpdater = initAutoUpdater({
      isMacSigned: false,
      getWebContents: () => mainWindow?.webContents ?? null,
    }).dispose;
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow(locale);
    });
  } catch (error) {
    // A center DB migrated by a newer app build, then reopened after a rollback
    // (SOU-128): refuse to open rather than silently no-op pending migrations
    // against a schema shape this build doesn't know.
    if (error instanceof DatabaseSchemaAheadOfAppError) {
      dialog.showErrorBox(
        'Centre Soutien',
        `${DATABASE_SCHEMA_AHEAD_MESSAGE.fr}\n\n${DATABASE_SCHEMA_AHEAD_MESSAGE.ar}`,
      );
      app.quit();
      return;
    }
    // SOU-179: no safe way to open the DB — keychain unavailable, key-store
    // corrupt, or the derived key no longer opens the file. Fail closed and
    // surface; never fall back to a known key.
    if (
      error instanceof KeyStoreUnavailableError ||
      error instanceof KeyStoreCorruptError ||
      error instanceof DatabaseKeyMismatchError
    ) {
      dialog.showErrorBox('Centre Soutien', `${DATABASE_KEY_MESSAGE.fr}\n\n${DATABASE_KEY_MESSAGE.ar}`);
      app.quit();
      return;
    }
    // Any other startup error rethrows into an unhandled rejection of the
    // `whenReady()` promise (unchanged pre-SOU-128 behavior) — not caught by
    // `console.error` below, which only handles `whenReady()` itself rejecting.
    throw error;
  }
}, console.error);

app.on('will-quit', () => {
  // The MainRuntime owns the live container after any hot-swap (demo toggle or
  // center switch), so disposing it closes whichever center is currently open —
  // the host only delegates, it holds no separate handle to release.
  runtime?.dispose();
  runtime = null;
  host = null;
  disposeAutoUpdater?.();
  disposeAutoUpdater = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
