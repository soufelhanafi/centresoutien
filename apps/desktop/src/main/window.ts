import { BrowserWindow, shell } from 'electron';
import { isAllowedExternalUrl } from './ipc/external-allowlist';
import { isTrustedRendererUrl, resolveTrustedRendererOrigin } from './security/renderer-origin';

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

  // `CS_E2E_HIDDEN` keeps the window off-screen for local Playwright runs on
  // macOS (no Xvfb equivalent there) — Playwright drives it over CDP either
  // way, so hiding it doesn't affect what the e2e suite can assert on.
  if (process.env['CS_E2E_HIDDEN'] !== '1') window.once('ready-to-show', () => window.show());

  const trustedOrigin = resolveTrustedRendererOrigin(renderer.devUrl);

  // A popup never opens in-app; only an allowlisted external URL (https + a known
  // host — see external-allowlist) is handed to the OS browser. A `file:`, custom
  // scheme, or foreign host is denied and never reaches `shell.openExternal` (SOU-236).
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // The main renderer is a SPA that never leaves its own origin; any renderer-
  // initiated navigation or redirect off it is blocked so compromised content
  // cannot pull a foreign page into the trusted window (SOU-236).
  const blockOffOriginNavigation = (event: Electron.Event, url: string): void => {
    if (!isTrustedRendererUrl(url, trustedOrigin)) event.preventDefault();
  };
  window.webContents.on('will-navigate', blockOffOriginNavigation);
  window.webContents.on('will-redirect', blockOffOriginNavigation);

  if (renderer.devUrl) {
    const search = renderer.query ? `?${new URLSearchParams(renderer.query).toString()}` : '';
    void window.loadURL(`${renderer.devUrl}${search}`);
  } else {
    void window.loadFile(renderer.indexHtml, renderer.query ? { query: renderer.query } : undefined);
  }
  return window;
}
