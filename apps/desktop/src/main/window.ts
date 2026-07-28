import { BrowserWindow, shell } from 'electron';

export type RendererEntry = { devUrl: string | undefined; indexHtml: string };

/**
 * Create the hardened main window (CLAUDE.md §5quater): context isolation on,
 * node integration off, sandboxed renderer, external links open in the OS
 * browser rather than in-app.
 */
export function createMainWindow(preloadPath: string, renderer: RendererEntry): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (renderer.devUrl) {
    void window.loadURL(renderer.devUrl);
  } else {
    void window.loadFile(renderer.indexHtml);
  }
  return window;
}
