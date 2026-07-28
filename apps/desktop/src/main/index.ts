import { join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { registerIpc } from './ipc/register';
import { createHandlers } from './ipc/handlers';
import { createMainWindow } from './window';

/**
 * Electron main entry (SOU-15). Registers the typed IPC handlers, then opens the
 * hardened window. The composition root — wiring domain use cases to the SQLite
 * adapters and exposing them as IPC handlers — grows from here.
 */
function openWindow(): void {
  const preload = join(import.meta.dirname, '../preload/index.mjs');
  createMainWindow(preload, {
    devUrl: process.env['ELECTRON_RENDERER_URL'],
    indexHtml: join(import.meta.dirname, '../renderer/index.html'),
  });
}

app.whenReady().then(() => {
  registerIpc(ipcMain, createHandlers({ appVersion: () => app.getVersion() }));
  openWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow();
  });
}, console.error);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
