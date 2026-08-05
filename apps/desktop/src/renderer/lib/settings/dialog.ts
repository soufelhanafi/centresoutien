/**
 * Thin wrappers around the native folder/file picker channels (SOU-102).
 * Not TanStack Query hooks: picking a file has no server state to cache or
 * invalidate, it is a one-shot request/response like `window.confirm`.
 * Resolve to `null` path when the user cancels — never throw.
 *
 * The file pickers also carry the one-time `token` main issued for the picked
 * path (SOU-44 M3): present THAT to the backup channels, never the raw path, so
 * main can be sure it only reads/writes what the user picked in a dialog.
 */
export function selectFolder(): Promise<string | null> {
  return window.api.invoke('dialog.selectFolder', {}).then((result) => result.path);
}

export type DialogPickResult = {
  /** One-time main-issued handle for `path`; null exactly when `path` is null. */
  token: string | null;
  path: string | null;
};

export function selectFile(extensions?: readonly string[]): Promise<DialogPickResult> {
  return window.api
    .invoke('dialog.selectFile', extensions ? { extensions: [...extensions] } : {})
    .then((result) => ({ token: result.token, path: result.path }));
}

/** Native Save-As dialog (SOU-44): pre-fills `defaultFileName`, resolves to the
 *  destination path + its token, or `null` when the user cancels. */
export function selectSaveFile(
  defaultFileName: string,
  extensions?: readonly string[],
): Promise<DialogPickResult> {
  return window.api
    .invoke('dialog.selectSaveFile', {
      defaultFileName,
      ...(extensions?.length ? { extensions: [...extensions] } : {}),
    })
    .then((result) => ({ token: result.token, path: result.path }));
}
