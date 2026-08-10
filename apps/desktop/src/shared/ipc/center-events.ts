/**
 * Main→renderer push channel emitted right after a successful live center switch
 * (SOU-96). Unlike the `center.*` invoke channels this is a one-way
 * `webContents.send` / `ipcRenderer.on` event: the renderer resets its query
 * caches when it fires, because the hot-swap replaced every repository behind the
 * IPC boundary with the newly-opened center's DB. Named as a constant so the
 * main emitter and the preload subscriber can never drift.
 */
export const CENTER_CHANGED_EVENT = 'center.changed';

/** Payload of {@link CENTER_CHANGED_EVENT}: the now-open center's identity. */
export type CenterChangedEvent = {
  centreId: string;
  centerCode: string;
  displayName: string;
};
