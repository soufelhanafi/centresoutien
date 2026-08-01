import { join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { PLANS } from '@centresoutien/domain';
import type { PlanId, CenterCode } from '@centresoutien/domain';
import { registerIpc } from './ipc/register';
import { buildContainer, type Container } from './composition-root';
import { createHandlers } from './ipc/handlers';
import { createMainWindow } from './window';

/** Active plan: from the license later; for now a dev override, default Essentiel. */
function activePlanId(): PlanId {
  const requested = process.env['CS_PLAN'];
  return requested && requested in PLANS ? (requested as PlanId) : 'essentiel';
}

let container: Container | null = null;

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
  container = buildContainer({
    centreId: process.env['CS_CENTRE'] ?? 'local',
    centerCode: (process.env['CS_CENTER_CODE'] ?? 'CS-DEV-001') as CenterCode,
    key: process.env['CS_DB_KEY'] ?? 'dev-insecure-key',
    dir: app.getPath('userData'),
    planId: activePlanId(),
    appVersion: () => app.getVersion(),
  });
  registerIpc(ipcMain, createHandlers(container.handlerDeps));
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
