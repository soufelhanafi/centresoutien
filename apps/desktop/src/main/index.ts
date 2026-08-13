/// <reference types="vite/client" />
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, dialog, BrowserWindow, ipcMain } from 'electron';
import { PLANS, CenterSwitchError } from '@centresoutien/domain';
import type { PlanId, CenterCode } from '@centresoutien/domain';
import { buildContainer, type Container } from './composition-root';
import { MainRuntime } from './main-runtime';
import { CenterHost } from './center/center-host';
import { createMainWindow } from './window';
import { createIpcSenderGuard, isTrustedIpcEvent } from './security/ipc-sender-guard';
import { resolveTrustedRendererOrigin, type TrustedRendererOrigin } from './security/renderer-origin';
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
import { sweepStaleTempPdfs } from '../data/fs/temp-pdf';

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
function openWindow(locale: string | undefined, trustedOrigin: TrustedRendererOrigin): void {
  const preload = join(import.meta.dirname, '../preload/index.js');
  mainWindow = createMainWindow(
    preload,
    {
      devUrl: process.env['ELECTRON_RENDERER_URL'],
      indexHtml: RENDERER_INDEX_HTML,
      ...(locale ? { query: { locale } } : {}),
    },
    trustedOrigin,
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
    const hubServer = resolveHubConfig();
    // A hub host already wires its own client at its own listener; only a device
    // that serves no hub can point at an external one (SOU-82).
    const hubClient = hubServer ? null : resolveHubClientConfig();
    const dir = app.getPath('userData');
    const realCentreId = process.env['CS_CENTRE'] ?? 'local';
    const realCenterCode = (process.env['CS_CENTER_CODE'] ?? 'CS-DEV-001') as CenterCode;

    // Center switcher (SOU-96). The directory scans the userData dir for
    // `centre-*.db`, deriving each center's own key to read its profile in
    // isolation. The `centerSwitch` closures are threaded into every container so
    // `SwitchCenter`/`center.list` resolve against the live host.
    const directory = new FsCenterDirectory(dir, (id) => centerDbKey(dir, id).key);
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
    // `CS_LOCALE` (dev override) wins over the persisted preference (SOU-31); the
    // language tab writes that preference via `preferences.locale.set`, read
    // synchronously here so it survives a restart without waiting on the renderer.
    const locale = process.env['CS_LOCALE'] ?? runtime.readLocalePreference() ?? undefined;
    openWindow(locale, trustedOrigin);
    // SOU-87: auto-update. Self-guards via app.isPackaged (off in dev/e2e).
    // isMacSigned is false until the macOS Developer ID signing ticket ships —
    // macOS runs check-only and never attempts a (failing) unsigned apply.
    disposeAutoUpdater = initAutoUpdater({
      isMacSigned: false,
      getWebContents: () => mainWindow?.webContents ?? null,
      isTrustedSender: (event) => isTrustedIpcEvent(event, trustedOrigin),
    }).dispose;
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow(locale, trustedOrigin);
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
