/// <reference types="vite/client" />
import { join } from 'node:path';
import { app, dialog, BrowserWindow, ipcMain } from 'electron';
import { PLANS } from '@centresoutien/domain';
import type { PlanId, CenterCode } from '@centresoutien/domain';
import { registerIpc } from './ipc/register';
import { buildContainer, type Container } from './composition-root';
import { createHandlers } from './ipc/handlers';
import { createMainWindow } from './window';
import { DATABASE_SCHEMA_AHEAD_MESSAGE, DatabaseSchemaAheadOfAppError } from '../data/sqlite/migration-runner';
import { centreDbFileName, DatabaseKeyMismatchError, ensureDatabaseKeyed } from '../data/sqlite/db';
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

let container: Container | null = null;

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

/** Relaunch the app with the demo flag appended (enter demo mode, SOU-110). */
function scheduleRestartIntoDemo(): void {
  setTimeout(() => {
    app.relaunch({ args: [...process.argv.slice(1), DEMO_ARG] });
    app.exit(0);
  }, 300);
}

/** Relaunch the app with the demo flag removed (return to the real center). */
function scheduleRestartIntoReal(): void {
  setTimeout(() => {
    app.relaunch({ args: process.argv.slice(1).filter((arg) => arg !== DEMO_ARG) });
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
  createMainWindow(preload, {
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
    const hubServer = resolveHubConfig();
    // A hub host already wires its own client at its own listener; only a device
    // that serves no hub can point at an external one (SOU-82).
    const hubClient = hubServer ? null : resolveHubClientConfig();
    const dir = app.getPath('userData');
    const demoRequested = process.argv.includes(DEMO_ARG) || process.env['CS_CENTRE'] === DEMO_CENTRE_ID;
    const centreId = demoRequested ? DEMO_CENTRE_ID : (process.env['CS_CENTRE'] ?? 'local');
    const centerCode = (demoRequested ? demoCenterCode() : (process.env['CS_CENTER_CODE'] ?? 'CS-DEV-001')) as CenterCode;
    // SOU-179: `CS_DB_KEY` is a dev/e2e-only override (same gate as `CS_PLAN`
    // and the `__CS_E2E__` license seam) — a release build never reads it, so
    // no code path can open a center DB with the legacy placeholder key. The
    // E2E build defaults to a fixed key so specs never touch the host keychain;
    // dev (override unset) derives from the real keychain like production.
    const keyContext = centerDbKey(dir, centreId);
    const key = keyContext.key;
    const legacyKeys = keyContext.legacyKeys;
    // Re-key any DB still under a pre-SOU-179 dev key — an explicit, opt-in
    // legacy-key list the caller chooses; production passes none, so a DB the
    // derived key cannot open fails closed instead of silently accepting it.
    // The hub's canonical store (SOU-90) shares the center key, so it is
    // re-keyed the same way when it exists.
    ensureDatabaseKeyed(join(dir, centreDbFileName(centreId)), key, legacyKeys);
    ensureDatabaseKeyed(join(dir, hubDbFileName(centreId)), key, legacyKeys);

    // First open of a fresh demo DB (no seeded marker): build + seed it now, so
    // the window opens onto a fully-populated demo center. `demo.create` from a
    // real center reuses the same path then relaunches with the flag.
    if (demoRequested && !demoCenterSeeded(dir, key)) {
      await prepareDemoCenter({ dir, demoKey: key, appVersion: () => app.getVersion(), scheduleRestart });
    }

    container = buildContainer({
      centreId,
      centerCode,
      key,
      dir,
      planId: activePlanId(),
      appVersion: () => app.getVersion(),
      scheduleRestart,
      // Demo mode closures (SOU-110): create builds + seeds the demo DB then
      // relaunches into it; wipe disposes the open demo container, deletes every
      // demo artefact (logo resolved from the still-open DB first), and relaunches
      // to the real center. The closures exist regardless so `demo.status` can
      // answer, but each mutation guards on the demo centreId being the open one:
      // a stray `demo.create` while already in demo would re-seed the session,
      // and a stray `demo.wipe` from a real center would dispose the real
      // container (review M1/s1).
      demo: {
        isDemoCenter: demoRequested,
        create: async () => {
          if (demoRequested) return;
          await prepareDemoCenter({
            dir,
            demoKey: centerDbKey(dir, DEMO_CENTRE_ID).key,
            appVersion: () => app.getVersion(),
            scheduleRestart,
          });
          scheduleRestartIntoDemo();
        },
        wipe: async () => {
          if (!demoRequested) return;
          const logoPath = container ? readDemoLogoPath(container.db) : null;
          container?.dispose();
          container = null;
          wipeDemoArtefacts(dir, logoPath);
          scheduleRestartIntoReal();
        },
      },
      // The demo container never joins sync (review s3): hosting a hub could
      // collide with the real hub's port/token and expose demo data on the LAN;
      // being a client would pull real data into a session meant to be disposable.
      // hubServer/hubClient stay mutually exclusive (SOU-82) whenever demo isn't.
      ...(demoRequested ? {} : hubServer ? { hubServer } : hubClient ? { hubClient } : {}),
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
  registerIpc(ipcMain, createHandlers(container.handlerDeps), {
    isRestricted: container.isRestricted,
    isSetupComplete: container.isSetupComplete,
  });
  // `CS_LOCALE` (dev override) wins over the persisted preference (SOU-31); the
  // language tab writes that preference via `preferences.locale.set`, read
  // synchronously here so it survives a restart without waiting on the renderer.
  const locale = process.env['CS_LOCALE'] ?? container.readLocalePreference() ?? undefined;
  openWindow(locale);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow(locale);
  });
}, console.error);

app.on('will-quit', () => {
  container?.dispose();
  container = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
