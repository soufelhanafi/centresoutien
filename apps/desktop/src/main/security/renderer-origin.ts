/**
 * The origin the app's own renderer is trusted to run under, and the predicates
 * that decide whether an IPC sender or a navigation target belongs to it.
 *
 * Kept pure and Electron-free so the whole trust decision is unit-testable
 * without launching the app (SOU-236). The Electron-facing glue that reads a
 * live `WebFrameMain` lives in `ipc-sender-guard.ts`; the navigation guard in
 * `window.ts` consumes these predicates directly.
 *
 * A packaged build loads the renderer from disk (`loadFile`), so its frames
 * report a `file:` URL; in dev electron-vite serves it over http(s). Anything
 * outside that origin — a subframe navigated elsewhere, a popup to a foreign
 * host, a compromised renderer trying to reach an OS scheme — is hostile.
 *
 * The packaged `file:` variant pins the trust to the exact index entry's path,
 * not the `file:` scheme alone (SOU-242): a `file:` URL has no comparable
 * `origin`, so without the path pin the navigation guard would let a compromised
 * renderer redirect to any other local file. `indexUrl` is the pre-computed
 * `file:` href of the renderer entry (`pathToFileURL(indexHtml).href`), passed in
 * from the composition root so this module stays free of `node:*` and unit-testable.
 */
export type TrustedRendererOrigin =
  | { readonly kind: 'file'; readonly indexUrl: string }
  | { readonly kind: 'dev'; readonly origin: string };

/**
 * The trusted origin for this build: the dev server's origin when a renderer
 * dev URL is present, otherwise the packaged renderer entry pinned by path. A
 * dev URL that fails to parse falls back to the packaged entry rather than
 * trusting a malformed value.
 */
export function resolveTrustedRendererOrigin(
  devUrl: string | undefined,
  indexFileUrl: string,
): TrustedRendererOrigin {
  if (devUrl) {
    try {
      return { kind: 'dev', origin: new URL(devUrl).origin };
    } catch {
      // Malformed dev URL: fall through to the packaged entry rather than trust it.
    }
  }
  return { kind: 'file', indexUrl: indexFileUrl };
}

/**
 * Fold a Windows drive letter to upper case so `file:///c:/…` and `file:///C:/…`
 * compare equal. On case-insensitive volumes the same file can surface under
 * either casing depending on the producer — Node's `pathToFileURL` (the expected
 * side) vs Chromium's file-URL canonicalizer (the live frame URL) do not
 * case-fold the pathname — so an unfolded compare risks a false negative that
 * would break every IPC channel on Windows (SOU-242). No-op on POSIX paths.
 */
function normalizeFileDriveLetter(pathname: string): string {
  return pathname.replace(/^\/([a-zA-Z]):\//, (_match, drive: string) => `/${drive.toUpperCase()}:/`);
}

/**
 * True when `rawUrl` belongs to the renderer's own trusted origin. For a
 * packaged build that means the same `file:` entry path as the loaded index
 * (search and hash ignored — `loadFile` appends `?locale=…` and the SPA routes
 * on the hash); in dev it means an exact origin match, so a different port or
 * host is refused. Both paths are normalized through `URL` and a drive-letter
 * fold, so percent-encoding, separators, and Windows casing compare identically
 * across platforms; a foreign `file:` path (or any non-`file:` scheme) is refused.
 */
export function isTrustedRendererUrl(rawUrl: string, trusted: TrustedRendererOrigin): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (trusted.kind === 'dev') return url.origin === trusted.origin;
  if (url.protocol !== 'file:') return false;
  let expected: URL;
  try {
    expected = new URL(trusted.indexUrl);
  } catch {
    return false;
  }
  if (expected.protocol !== 'file:') return false;
  return normalizeFileDriveLetter(url.pathname) === normalizeFileDriveLetter(expected.pathname);
}

/** The sender fields the IPC guard inspects — the subset extracted from a `WebFrameMain`. */
export type IpcSenderFrame = {
  readonly url: string;
  /** True when the sending frame has a parent, i.e. it is a subframe, not the top document. */
  readonly hasParent: boolean;
};

/**
 * An IPC call is trusted only when it comes from the top frame (never a
 * subframe/iframe) of the renderer's own origin. A missing frame is refused.
 */
export function isTrustedIpcSender(
  frame: IpcSenderFrame | null,
  trusted: TrustedRendererOrigin,
): boolean {
  if (!frame || frame.hasParent) return false;
  return isTrustedRendererUrl(frame.url, trusted);
}
