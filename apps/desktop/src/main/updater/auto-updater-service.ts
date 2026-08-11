import { app, ipcMain, type WebContents } from 'electron';
import electronUpdater from 'electron-updater';
import {
  resolveUpdaterCapability,
  isCheckDue,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_FIRST_CHECK_DELAY_MS,
} from './update-policy';
import {
  UPDATE_STATUS_EVENT,
  UPDATE_RESTART_COMMAND,
  type UpdateStatusEvent,
} from '../../shared/ipc/update-events';

// electron-updater is CommonJS; the named `autoUpdater` export is only reachable
// through the default import under electron-vite's ESM output.
const { autoUpdater } = electronUpdater;

export type AutoUpdaterDeps = {
  isMacSigned: boolean;
  getWebContents: () => WebContents | null;
};

export function initAutoUpdater(deps: AutoUpdaterDeps): void {
  const capability = resolveUpdaterCapability({
    isPackaged: app.isPackaged,
    platform: process.platform,
    isMacSigned: deps.isMacSigned,
  });
  if (!capability.enabled) {
    return;
  }

  autoUpdater.autoDownload = capability.canApply;
  autoUpdater.autoInstallOnAppQuit = capability.canApply;
  autoUpdater.logger = {
    info: (...a: unknown[]) => console.info('[updater]', ...a),
    warn: (...a: unknown[]) => console.warn('[updater]', ...a),
    error: (...a: unknown[]) => console.error('[updater]', ...a),
    debug: (...a: unknown[]) => console.debug('[updater]', ...a),
  };

  const emit = (event: UpdateStatusEvent): void => {
    deps.getWebContents()?.send(UPDATE_STATUS_EVENT, event);
  };

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => emit({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => emit({ state: 'not-available' }));
  autoUpdater.on('download-progress', (progress) =>
    emit({ state: 'downloading', percent: Math.round(progress.percent) }),
  );
  autoUpdater.on('update-downloaded', (info) => emit({ state: 'downloaded', version: info.version }));
  // Errors are logged and surfaced as a status, never thrown into a modal — an
  // offline center must never see an update crash.
  autoUpdater.on('error', (error) => emit({ state: 'error', message: error.message }));

  if (capability.canApply) {
    ipcMain.on(UPDATE_RESTART_COMMAND, () => autoUpdater.quitAndInstall());
  }

  let lastCheckAt: number | null = null;
  const check = (): void => {
    if (!isCheckDue({ lastCheckAt, now: Date.now(), intervalMs: UPDATE_CHECK_INTERVAL_MS })) {
      return;
    }
    lastCheckAt = Date.now();
    void autoUpdater
      .checkForUpdates()
      .catch((error: unknown) => emit({ state: 'error', message: String(error) }));
  };

  setTimeout(check, UPDATE_FIRST_CHECK_DELAY_MS);
  setInterval(check, UPDATE_CHECK_INTERVAL_MS);
}
