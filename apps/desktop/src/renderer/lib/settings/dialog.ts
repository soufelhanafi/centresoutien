/**
 * Thin wrappers around the native folder/file picker channels (SOU-102).
 * Not TanStack Query hooks: picking a file has no server state to cache or
 * invalidate, it is a one-shot request/response like `window.confirm`.
 * Resolve to `null` when the user cancels — never throw.
 */
export function selectFolder(): Promise<string | null> {
  return window.api.invoke('dialog.selectFolder', {}).then((result) => result.path);
}

export function selectFile(extensions?: readonly string[]): Promise<string | null> {
  return window.api.invoke('dialog.selectFile', extensions ? { extensions: [...extensions] } : {}).then(
    (result) => result.path,
  );
}

/** Native Save-As dialog (SOU-44): pre-fills `defaultFileName`, resolves to the
 *  destination path, or `null` when the user cancels. */
export function selectSaveFile(defaultFileName: string, extensions?: readonly string[]): Promise<string | null> {
  return window.api
    .invoke('dialog.selectSaveFile', {
      defaultFileName,
      ...(extensions?.length ? { extensions: [...extensions] } : {}),
    })
    .then((result) => result.path);
}
