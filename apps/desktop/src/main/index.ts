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

app.whenReady().then(() => {
  // Dev defaults; real center selection, key management, and license-driven plan
  // arrive with first-run setup and the center switcher.
  try {
    const hubServer = resolveHubConfig();
    container = buildContainer({
      centreId: process.env['CS_CENTRE'] ?? 'local',
      centerCode: (process.env['CS_CENTER_CODE'] ?? 'CS-DEV-001') as CenterCode,
      key: process.env['CS_DB_KEY'] ?? 'dev-insecure-key',
      dir: app.getPath('userData'),
      planId: activePlanId(),
      appVersion: () => app.getVersion(),
      scheduleRestart,
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
