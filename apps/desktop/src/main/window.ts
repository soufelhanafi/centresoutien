import { BrowserWindow, shell } from 'electron';

export type RendererEntry = {
  devUrl: string | undefined;
  indexHtml: string;
  query?: Record<string, string>;
};

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
    const search = renderer.query ? `?${new URLSearchParams(renderer.query).toString()}` : '';
    void window.loadURL(`${renderer.devUrl}${search}`);
  } else {
    void window.loadFile(renderer.indexHtml, renderer.query ? { query: renderer.query } : undefined);
  }
  return window;
}
