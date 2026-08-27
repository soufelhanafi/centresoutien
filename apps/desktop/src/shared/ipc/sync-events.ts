/**
 * Main→renderer push channel for live sync progress (SOU-330). A chunked pull
 * fires this once per pulled chunk so the sync / import screen can show a real
 * "X / Y" bar with an ETA, instead of a single opaque spinner. Like
 * `center.changed` it is a one-way `webContents.send` / `ipcRenderer.on` event,
 * named as a constant so the main emitter and the preload subscriber never drift.
 */
export const SYNC_PROGRESS_EVENT = 'sync.progress';

/** Payload of {@link SYNC_PROGRESS_EVENT}: feed rows received so far vs the total. */
export type SyncProgressEvent = {
  /** Feed rows received and applied so far in the current run. */
  readonly pulled: number;
  /** Total feed rows this run will pull (received so far + still queued on the hub). */
  readonly total: number;
};
