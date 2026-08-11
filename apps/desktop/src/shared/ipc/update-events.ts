// Main→renderer push channel (SOU-87). One-way `webContents.send` /
// `ipcRenderer.on`, like {@link CENTER_CHANGED_EVENT}: main forwards
// electron-updater lifecycle as a normalized status; the renderer decides
// what to surface. Named constants so emitter and subscriber never drift.
export const UPDATE_STATUS_EVENT = 'update.status';

// Renderer→main fire-and-forget command (SOU-87): the user clicked "restart
// now" on the update toast. No response — main calls `quitAndInstall`, so the
// process exits. Deliberately a `send`/`on` command, not a typed invoke
// channel, because there is nothing to await.
export const UPDATE_RESTART_COMMAND = 'update.restart-now';

// Normalized updater lifecycle forwarded over {@link UPDATE_STATUS_EVENT}.
export type UpdateStatusEvent =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };
