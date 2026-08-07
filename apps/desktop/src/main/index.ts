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
    const dir = app.getPath('userData');
    const demoRequested = process.argv.includes(DEMO_ARG) || process.env['CS_CENTRE'] === DEMO_CENTRE_ID;
    const centreId = demoRequested ? DEMO_CENTRE_ID : (process.env['CS_CENTRE'] ?? 'local');
    const centerCode = (demoRequested ? demoCenterCode() : (process.env['CS_CENTER_CODE'] ?? 'CS-DEV-001')) as CenterCode;
    // SOU-179: `CS_DB_KEY` is a dev/e2e-only override (same gate as `CS_PLAN`
    // and the `__CS_E2E__` license seam) — a release build never reads it, so
    // no code path can open a center DB with the legacy placeholder key. The
    // E2E build defaults to a fixed key so specs never touch the host keychain;
    // dev (override unset) derives from the real keychain like production.
    const devOrE2eKey =
      import.meta.env.DEV || __CS_E2E__
        ? (process.env['CS_DB_KEY'] ?? (__CS_E2E__ ? E2E_FIXED_DB_KEY : undefined))
        : undefined;
    const key =
      devOrE2eKey ?? resolveCenterKey(new SafeStorageSecretVault(join(dir, KEY_STORE_FILE_NAME)), centreId);
    // Re-key any DB still under a pre-SOU-179 dev key — an explicit, opt-in
    // legacy-key list the caller chooses; production passes none, so a DB the
    // derived key cannot open fails closed instead of silently accepting it.
    // The hub's canonical store (SOU-90) shares the center key, so it is
    // re-keyed the same way when it exists.
    const legacyKeys = devOrE2eKey ? [] : [LEGACY_DEV_DB_KEY];
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
      // to the real center. Only wired when the demo centreId is the open one —
      // but the closures exist regardless so `demo.status` can answer.
      demo: {
        isDemoCenter: demoRequested,
        create: async () => {
          await prepareDemoCenter({
            dir,
            demoKey: resolveCenterKey(new SafeStorageSecretVault(join(dir, KEY_STORE_FILE_NAME)), DEMO_CENTRE_ID),
            appVersion: () => app.getVersion(),
            scheduleRestart,
          });
          scheduleRestartIntoDemo();
        },
        wipe: async () => {
          const logoPath = container ? readDemoLogoPath(container.db) : null;
          container?.dispose();
          container = null;
          wipeDemoArtefacts(dir, logoPath);
          scheduleRestartIntoReal();
        },
      },
      ...(hubServer ? { hubServer } : {}),
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
