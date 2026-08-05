import { BrowserWindow, dialog } from 'electron';
import type { IpcHandlers } from '../../shared/ipc/contract';

/**
 * Native folder/file picker handlers (SOU-102, SOU-44), split out like
 * `backup-handlers.ts`. Stateless — no domain use case involved, just the OS
 * dialog — so unlike every other handler group this one needs no `deps`.
 * Attaches to the focused window when there is one so the dialog is modal;
 * falls back to an unattached dialog otherwise (still works, just not modal).
 */
export function createDialogHandlers(): Pick<
  IpcHandlers,
  'dialog.selectFolder' | 'dialog.selectFile' | 'dialog.selectSaveFile'
> {
  return {
    'dialog.selectFolder': async () => {
      const win = BrowserWindow.getFocusedWindow();
      const result = win
        ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
      return { path: result.canceled ? null : (result.filePaths[0] ?? null) };
    },
    'dialog.selectFile': async (request) => {
      const properties: Electron.OpenDialogOptions['properties'] = ['openFile'];
      const filters = request.extensions?.length ? [{ name: 'Fichier', extensions: [...request.extensions] }] : undefined;
      const options = { properties, ...(filters ? { filters } : {}) };
      const win = BrowserWindow.getFocusedWindow();
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
      return { path: result.canceled ? null : (result.filePaths[0] ?? null) };
    },
    'dialog.selectSaveFile': async (request) => {
      const filters = request.extensions?.length ? [{ name: 'Fichier', extensions: [...request.extensions] }] : undefined;
      const options = { defaultPath: request.defaultFileName, ...(filters ? { filters } : {}) };
      const win = BrowserWindow.getFocusedWindow();
      const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
      return { path: result.canceled || !result.filePath ? null : result.filePath };
    },
  };
}
