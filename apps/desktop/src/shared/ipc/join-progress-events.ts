// Main→renderer push channel (45-minute-onboarding follow-up), same shape as
// {@link UPDATE_STATUS_EVENT}: one-way `webContents.send` / `ipcRenderer.on`.
// Fired repeatedly while `hub.joinCenter`'s cold bootstrap drains the hub feed
// page by page, so the join wizard can show real, moving progress instead of
// an indeterminate spinner for however long a mature center's history takes.
export const JOIN_PROGRESS_EVENT = 'hub.join.progress';

export type JoinProgressEvent = {
  /** Entities applied so far in this cold bootstrap — cumulative, not per-page. */
  readonly applied: number;
};
