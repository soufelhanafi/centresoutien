/// <reference types="vite/client" />
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, dialog, BrowserWindow, ipcMain, Menu } from 'electron';
import { PLANS, CenterSwitchError } from '@centresoutien/domain';
import type { PlanId, CenterCode } from '@centresoutien/domain';
import { buildContainer, type Container } from './composition-root';
import { MainRuntime } from './main-runtime';
import { CenterHost } from './center/center-host';
import { createMainWindow, loadRenderer, type RendererEntry } from './window';
import { menuLabelsFor } from './menu-labels';
import { createIpcSenderGuard, isTrustedIpcEvent } from './security/ipc-sender-guard';
import { resolveTrustedRendererOrigin, type TrustedRendererOrigin } from './security/renderer-origin';
import { initAutoUpdater } from './updater/auto-updater-service';
import { DATABASE_SCHEMA_AHEAD_MESSAGE, DatabaseSchemaAheadOfAppError } from '../data/sqlite/migration-runner';
import { centreDbFileName, DatabaseKeyMismatchError, ensureDatabaseKeyed } from '../data/sqlite/db';
import { FsCenterDirectory, type CenterSummary } from '../data/sqlite/center-directory';
import { CENTER_CHANGED_EVENT, type CenterChangedEvent } from '../shared/ipc/center-events';
import { JOIN_PROGRESS_EVENT } from '../shared/ipc/join-progress-events';
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
import { randomBytes } from 'node:crypto';
import { sweepStaleTempPdfs } from '../data/fs/temp-pdf';
import { LEGACY_DEMO_CENTRE_ID, resolveInitialCentreId } from './initial-centre-id';
import { HubHostConfigStore, isPreferredLanAddress, resolveLanBindHost } from './infra/hub-host-config-store';
import { HubClientConfigStore } from './infra/hub-client-config-store';
import { DEFAULT_HUB_PORT } from '../shared/hub';
import { BonjourHubMdns } from './hub-discovery/mdns-adapters';

// The packaged renderer entry loaded from disk. Shared by the window's
// `loadFile` and the trusted-origin resolution so the `file:` trust is pinned to
// this exact entry (host + path), not the `file:` scheme (SOU-242).
const RENDERER_INDEX_HTML = join(import.meta.dirname, '../renderer/index.html');

/**
 * SOU-179: the DB key for `centreId` under the current build — the dev/e2e
 * override first, else the per-center keychain-derived key. `legacyKeys` mirrors the
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
let hubMdns: BonjourHubMdns | null = null;

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
 *
 * This is the dev/e2e override path only. In a packaged build the env vars are
 * unset and hosting comes from the persisted per-center config
 * ({@link HubHostConfigStore}) instead — see `resolveHubConfig` in the boot block.
 */
function resolveHubConfigFromEnv(): { port: number; token: string; bindHost: string } | null {
  if (process.env['CS_HUB_ENABLED'] !== '1') return null;
  const token = process.env['CS_HUB_TOKEN'];
  if (!token) {
    console.warn('[hub] CS_HUB_ENABLED=1 but no CS_HUB_TOKEN set — hub is NOT serving.');
    return null;
  }
  const rawPort = process.env['CS_HUB_PORT'] ?? String(DEFAULT_HUB_PORT);
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
 *
 * Dev/e2e override only. In a packaged build the env vars are unset and a joined
 * center's hub comes from the persisted per-center config
 * ({@link HubClientConfigStore}) — see `resolveHubClientConfig` in the boot block.
 */
function resolveHubClientConfigFromEnv(): { baseUrl: string; token: string } | null {
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
 * `CS_LOCALE` (dev override) wins over the persisted preference (SOU-31); read
 * fresh every time a window navigates — initial open, a `did-finish-load`-free
 * reload, or a macOS re-`activate` — so none of those paths can serve a locale
 * that's gone stale since app launch.
 */
function resolveLocale(): string | undefined {
  return process.env['CS_LOCALE'] ?? runtime?.readLocalePreference() ?? undefined;
}

function rendererEntry(locale: string | undefined): RendererEntry {
  return {
    devUrl: process.env['ELECTRON_RENDERER_URL'],
    indexHtml: RENDERER_INDEX_HTML,
    ...(locale ? { query: { locale } } : {}),
  };
}

/**
 * Electron main entry (SOU-15). Registers the typed IPC handlers, then opens the
 * hardened window. The composition root — wiring domain use cases to the SQLite
 * adapters and exposing them as IPC handlers — grows from here.
 */
function openWindow(trustedOrigin: TrustedRendererOrigin): void {
  const preload = join(import.meta.dirname, '../preload/index.js');
  const window = createMainWindow(preload, rendererEntry(resolveLocale()), trustedOrigin);
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  mainWindow = window;
}

/** The focused window if one is both open and alive, else the tracked main window (same fallback native Reload uses via `getFocusedWindow()`). */
function targetWindow(): BrowserWindow | null {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
  return window && !window.isDestroyed() ? window : null;
}

/**
 * Re-navigates instead of calling native `reload()`/`reloadIgnoringCache()`, so
 * Reload / Force Reload pick up the on-disk locale preference fresh every time
 * instead of the window's original URL, locale query string frozen at whatever
 * it was on launch. Also re-installs the menu so its own labels track the
 * locale that was just resolved.
 */
function reloadWithFreshLocale(bypassCache: boolean): void {
  const window = targetWindow();
  if (!window) return;
  const locale = resolveLocale();
  loadRenderer(window, rendererEntry(locale), bypassCache);
  installMenu(locale);
}

/**
 * The app ships no menu bar of its own, only Electron's per-platform default —
 * except Reload / Force Reload, whose labels come from `menuLabelsFor` (the
 * role-based items around them auto-localize via Electron/the OS).
 */
function installMenu(locale: string | undefined = resolveLocale()): void {
  const isMac = process.platform === 'darwin';
  const labels = menuLabelsFor(locale);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' as const }] : []),
      { role: 'fileMenu' as const },
      { role: 'editMenu' as const },
      {
        label: labels.view,
        submenu: [
          { label: labels.reload, accelerator: 'CmdOrCtrl+R', click: () => reloadWithFreshLocale(false) },
          { label: labels.forceReload, accelerator: 'CmdOrCtrl+Shift+R', click: () => reloadWithFreshLocale(true) },
          { role: 'toggleDevTools' as const },
          { type: 'separator' as const },
          { role: 'resetZoom' as const },
          { role: 'zoomIn' as const },
          { role: 'zoomOut' as const },
          { type: 'separator' as const },
          { role: 'togglefullscreen' as const },
        ],
      },
      { role: 'windowMenu' as const },
    ]),
  );
}

app.whenReady().then(async () => {
  // Dev defaults; real center selection, key management, and license-driven plan
  // arrive with first-run setup and the center switcher.
  try {
    // Stale temp PDFs from earlier runs (SOU-163): best-effort sweep BEFORE any
    // new print can land. The freshness threshold keeps a recently printed file
    // alive while the OS viewer reads it — a file younger than the threshold
    // cannot predate the previous session by more than a few minutes.
    sweepStaleTempPdfs(app.getPath('temp'));
    const dir = app.getPath('userData');
    // Hub hosting is per-center now (SOU-318): the env override is the dev/e2e
    // path; a packaged build reads which centers this device hosts (and on what
    // port/interface, under which pairing token) from the persisted store. Both
    // are resolved per centreId inside `openCenter`, so a center switch re-opens
    // the correct hub role for the target center.
    const hubHostConfigStore = new HubHostConfigStore(dir);
    const hubClientConfigStore = new HubClientConfigStore(dir);
    const resolveHubConfig = (centreId: string): { port: number; token: string; bindHost: string } | null => {
      const fromEnv = resolveHubConfigFromEnv();
      if (fromEnv) return fromEnv;
      const persisted = hubHostConfigStore.read(centreId);
      if (persisted === null || isPreferredLanAddress(persisted.bindHost)) return persisted;
      // The stored LAN address is gone (the machine moved networks) OR it names an
      // adapter we would no longer choose — a container/VPN bridge picked by a
      // build that predates the denylist, which stays live forever and so would
      // never re-resolve on a liveness check alone. Either way re-resolve so the
      // hub binds a reachable interface, and rewrite the config so hosting status
      // reflects the address it actually serves. Token + port are preserved, so a
      // laptop that already paired keeps its code.
      const healed = resolveLanBindHost();
      if (healed === null || healed === persisted.bindHost) return persisted;
      const next = { ...persisted, bindHost: healed };
      hubHostConfigStore.write(centreId, next);
      return next;
    };
    const resolveHubClientConfig = (centreId: string): { baseUrl: string; token: string } | null =>
      resolveHubClientConfigFromEnv() ?? hubClientConfigStore.read(centreId);
    // One Bonjour instance for the whole process (one multicast socket), shared as
    // advertiser + discoverer. Opening the socket can fail in a sandbox / on a
    // locked-down network — hosting config still works without it, so fail soft.
    try {
      hubMdns = new BonjourHubMdns();
    } catch (error) {
      console.warn('[hub] mDNS unavailable — hub advertise/discover disabled', error);
    }
    const realCentreId = resolveInitialCentreId(process.env['CS_CENTRE']);
    const realCenterCode = (process.env['CS_CENTER_CODE'] ?? 'CS-DEV-001') as CenterCode;

    // Center switcher (SOU-96). The directory scans the userData dir for
    // `centre-*.db`, deriving each center's own key to read its profile in
    // isolation. The `centerSwitch` closures are threaded into every container so
    // `SwitchCenter`/`center.list` resolve against the live host.
    const directory = new FsCenterDirectory(dir, (id) => centerDbKey(dir, id).key, [LEGACY_DEMO_CENTRE_ID]);
    const centerSwitch = {
      switchTo: (targetCentreId: string): Promise<void> =>
        host
          ? host.swapTo(targetCentreId)
          : Promise.reject(new CenterSwitchError('center switching is not ready')),
      listCenters: (): Promise<readonly CenterSummary[]> =>
        Promise.resolve(directory.list(runtime?.currentCentreId ?? realCentreId)),
    };

    // The single center-open path, reused by first boot and the SOU-96 center
    // switch. It re-keys and opens the target center's SQLCipher files, then wires
    // a fresh container with its center code, plan, key, hub, and switcher.
    const openCenter = (centreId: string): Container => {
      const centerCode: CenterCode =
        centreId === realCentreId
          ? realCenterCode
          : ((directory.peek(centreId)?.centerCode ?? `CS-${centreId.toUpperCase()}`) as CenterCode);
      // SOU-179: `CS_DB_KEY` is a dev/e2e-only override — a release build derives
      // the per-center key from the keychain. Re-key any DB still under a
      // pre-SOU-179 dev key (production passes no legacy keys, so a DB the derived
      // key cannot open fails closed); the hub store shares the center key.
      const { key, legacyKeys } = centerDbKey(dir, centreId);
      ensureDatabaseKeyed(join(dir, centreDbFileName(centreId)), key, legacyKeys);
      ensureDatabaseKeyed(join(dir, hubDbFileName(centreId)), key, legacyKeys);
      // This device's hub role for THIS center: it either hosts the center's hub
      // (env override or persisted config) or, failing that, may point at an
      // external hub. A hub host already wires its own client at its own listener,
      // so only a non-hosting device consults the client config (SOU-82).
      const hubServer = resolveHubConfig(centreId);
      const hubClient = hubServer ? null : resolveHubClientConfig(centreId);
      return buildContainer({
        centreId,
        centerCode,
        key,
        dir,
        tempDir: app.getPath('temp'),
        planId: activePlanId(),
        appVersion: () => app.getVersion(),
        scheduleRestart,
        centerSwitch,
        // Per-center stats (SOU-106): the same per-center key derivation + demo
        // exclusion the switcher's directory uses, so the read-only aggregation
        // opens exactly the centers the switcher lists.
        multiCenterStats: {
          keyFor: (id: string) => centerDbKey(dir, id).key,
          excludeCentreIds: [LEGACY_DEMO_CENTRE_ID],
        },
        // Add-a-center provisioning (SOU-310): a brand-new center derives its key
        // from the same keychain master as every other center (SOU-179), so the
        // provisioner reuses the switcher's per-center key derivation.
        provisioning: {
          keyFor: (id: string) => centerDbKey(dir, id).key,
        },
        // Join-an-existing-center provisioning (SOU-318): the cold-bootstrap
        // derives each new center's key the same way, and persists which hub the
        // joined center follows so it keeps syncing on boot.
        joining: {
          keyFor: (id: string) => centerDbKey(dir, id).key,
          clientConfig: {
            write: (id: string, config: { baseUrl: string; token: string }) =>
              hubClientConfigStore.write(id, config),
            clear: (id: string) => hubClientConfigStore.clear(id),
          },
          // 45-minute-onboarding follow-up: forwards the cold bootstrap's
          // per-page progress to the join wizard. `mainWindow` is read live
          // (not captured), matching `emitCenterChanged` above — the window
          // may not exist yet when this closure is built.
          reportProgress: (applied: number) =>
            mainWindow?.webContents.send(JOIN_PROGRESS_EVENT, { applied }),
        },
        // LAN hub hosting + discovery (SOU-318): config accessors bound to THIS
        // center's id, plus the shared mDNS adapter when the socket opened.
        hubHosting: {
          config: {
            read: () => hubHostConfigStore.read(centreId),
            write: (config) => hubHostConfigStore.write(centreId, config),
            clear: () => hubHostConfigStore.clear(centreId),
          },
          resolveBindHost: resolveLanBindHost,
          randomBytes: (size: number) => randomBytes(size),
          ...(hubMdns ? { advertiser: hubMdns, discoverer: hubMdns } : {}),
        },
        ...(hubServer ? { hubServer } : hubClient ? { hubClient } : {}),
      });
    };

    const initial = openCenter(realCentreId);
    // One trusted origin, resolved once and shared by the IPC sender guard, the
    // window navigation guard, and the updater restart channel, so a single fact
    // decides "our own renderer" everywhere and the guards can never drift apart
    // (SOU-236). It is the dev-server origin in dev, otherwise the packaged
    // renderer entry pinned to its exact `file:` path, not the scheme (SOU-242).
    const trustedOrigin = resolveTrustedRendererOrigin(
      process.env['ELECTRON_RENDERER_URL'],
      pathToFileURL(RENDERER_INDEX_HTML).href,
    );
    // Reject any invoke/handle call that is not the top frame of that origin — the
    // single sender/frame choke point for every IPC channel.
    runtime = new MainRuntime(ipcMain, initial, createIpcSenderGuard(trustedOrigin));
    // The center switcher (SOU-96) re-points the live container through the same
    // `swapTo` seam without touching `ipcMain`. `CenterHost` owns the installed-
    // center whitelist, same-center short-circuit, and `center.changed` emit.
    host = new CenterHost({
      runtime,
      buildForCenter: openCenter,
      listInstalledCentreIds: () =>
        directory.list(runtime?.currentCentreId ?? realCentreId).map((center) => center.centreId),
      emitCenterChanged: (event: CenterChangedEvent) =>
        mainWindow?.webContents.send(CENTER_CHANGED_EVENT, event),
    });
    openWindow(trustedOrigin);
    installMenu();
    // SOU-87: auto-update. Self-guards via app.isPackaged (off in dev/e2e).
    // isMacSigned is false until the macOS Developer ID signing ticket ships —
    // macOS runs check-only and never attempts a (failing) unsigned apply.
    disposeAutoUpdater = initAutoUpdater({
      isMacSigned: false,
      getWebContents: () => mainWindow?.webContents ?? null,
      isTrustedSender: (event) => isTrustedIpcEvent(event, trustedOrigin),
    }).dispose;
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow(trustedOrigin);
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
  // The MainRuntime owns the live container after a center switch, so disposing it closes whichever center is currently open —
  // the host only delegates, it holds no separate handle to release.
  runtime?.dispose();
  runtime = null;
  host = null;
  disposeAutoUpdater?.();
  disposeAutoUpdater = null;
  hubMdns?.destroy();
  hubMdns = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
