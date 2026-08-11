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

let initialized = false;

export type AutoUpdaterDeps = {
  isMacSigned: boolean;
  getWebContents: () => WebContents | null;
};

// Teardown hook wired into the app `will-quit` handler so the periodic timers
// and updater listeners are released on shutdown.
export type AutoUpdaterHandle = { dispose: () => void };

const NOOP_HANDLE: AutoUpdaterHandle = { dispose: () => {} };

type EmitStatus = (event: UpdateStatusEvent) => void;

function createUpdaterLogger() {
  return {
    info: (...args: unknown[]) => console.info('[updater]', ...args),
    warn: (...args: unknown[]) => console.warn('[updater]', ...args),
    error: (...args: unknown[]) => console.error('[updater]', ...args),
    debug: (...args: unknown[]) => console.debug('[updater]', ...args),
  };
}

// A window can be destroyed while periodic checks keep running (on macOS the
// process outlives its last window), so guard against sending to a dead
// WebContents — optional chaining only guards null, not destroyed.
function forwardStatus(getWebContents: () => WebContents | null, event: UpdateStatusEvent): void {
  const webContents = getWebContents();
  if (webContents && !webContents.isDestroyed()) {
    webContents.send(UPDATE_STATUS_EVENT, event);
  }
}

function wireUpdaterEvents(emit: EmitStatus, markDownloaded: () => void): void {
  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => emit({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => emit({ state: 'not-available' }));
  autoUpdater.on('download-progress', (progress) =>
    emit({ state: 'downloading', percent: Math.round(progress.percent) }),
  );
  autoUpdater.on('update-downloaded', (info) => {
    markDownloaded();
    emit({ state: 'downloaded', version: info.version });
  });
  // Errors are logged and surfaced as a status, never thrown into a modal — an
  // offline center must never see an update crash.
  autoUpdater.on('error', (error) => emit({ state: 'error', message: error.message }));
}

function startUpdateChecks(emit: EmitStatus): { dispose: () => void } {
  let lastCheckAt: number | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;

  const check = (): void => {
    if (!isCheckDue({ lastCheckAt, now: Date.now(), intervalMs: UPDATE_CHECK_INTERVAL_MS })) {
      return;
    }
    lastCheckAt = Date.now();
    void autoUpdater
      .checkForUpdates()
      .catch((error: unknown) => emit({ state: 'error', message: String(error) }));
  };

  // Anchor the recurring interval to the first check, not to launch: the first
  // check runs after a short delay and records `lastCheckAt`, so a launch-anchored
  // interval would fire one delay short of a full interval and be skipped, pushing
  // the second check to ~2 intervals after launch.
  const firstCheck = setTimeout(() => {
    check();
    interval = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
  }, UPDATE_FIRST_CHECK_DELAY_MS);

  return {
    dispose: () => {
      clearTimeout(firstCheck);
      if (interval) {
        clearInterval(interval);
      }
    },
  };
}

export function initAutoUpdater(deps: AutoUpdaterDeps): AutoUpdaterHandle {
  const capability = resolveUpdaterCapability({
    isPackaged: app.isPackaged,
    platform: process.platform,
    isMacSigned: deps.isMacSigned,
  });
  if (!capability.enabled || initialized) {
    return NOOP_HANDLE;
  }
  initialized = true;

  autoUpdater.autoDownload = capability.canApply;
  autoUpdater.autoInstallOnAppQuit = capability.canApply;
  autoUpdater.logger = createUpdaterLogger();

  const emit: EmitStatus = (event) => forwardStatus(deps.getWebContents, event);
  let updateReady = false;
  wireUpdaterEvents(emit, () => {
    updateReady = true;
  });

  // Restart only when an update actually downloaded — an untrusted renderer must
  // not be able to force a quit/install. Silent install + relaunch so the
  // assisted (oneClick:false) NSIS installer applies seamlessly, not as a wizard.
  const restart = (): void => {
    if (updateReady) {
      autoUpdater.quitAndInstall(true, true);
    }
  };
  if (capability.canApply) {
    ipcMain.on(UPDATE_RESTART_COMMAND, restart);
  }

  const checks = startUpdateChecks(emit);

  return {
    dispose: () => {
      checks.dispose();
      autoUpdater.removeAllListeners();
      ipcMain.removeListener(UPDATE_RESTART_COMMAND, restart);
      initialized = false;
    },
  };
}
