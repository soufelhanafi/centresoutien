import { BrowserWindow, dialog } from 'electron';
import type { IpcHandlers } from '../../shared/ipc/contract';
import type { DialogPathRegistry } from './dialog-path-registry';

/** Locale-neutral OS filter label derived from the requested extensions
 *  (`['xlsx']` → `'XLSX'`) — never a hardcoded language string, since the main
 *  process has no i18n store (SOU-44 M4). */
function filterName(extensions: readonly string[]): string {
  return extensions.map((extension) => extension.toUpperCase()).join(' / ');
}

/**
 * Native folder/file picker handlers (SOU-102, SOU-44), split out like
 * `backup-handlers.ts`. Needs only the {@link DialogPathRegistry} to turn every
 * picked path into a one-time token — no domain use case involved. Attaches to
 * the focused window when there is one so the dialog is modal; falls back to an
 * unattached dialog otherwise (still works, just not modal).
 */
export function createDialogHandlers(
  dialogPaths: DialogPathRegistry,
): Pick<
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
      const filters = request.extensions?.length
        ? [{ name: filterName(request.extensions), extensions: [...request.extensions] }]
        : undefined;
      const options = { properties, ...(filters ? { filters } : {}) };
      const win = BrowserWindow.getFocusedWindow();
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
      const path = result.canceled ? null : (result.filePaths[0] ?? null);
      return { token: path ? dialogPaths.issue(path) : null, path };
    },
    'dialog.selectSaveFile': async (request) => {
      const filters = request.extensions?.length
        ? [{ name: filterName(request.extensions), extensions: [...request.extensions] }]
        : undefined;
      const options = { defaultPath: request.defaultFileName, ...(filters ? { filters } : {}) };
      const win = BrowserWindow.getFocusedWindow();
      const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
      const path = result.canceled || !result.filePath ? null : result.filePath;
      return { token: path ? dialogPaths.issue(path) : null, path };
    },
  };
}
