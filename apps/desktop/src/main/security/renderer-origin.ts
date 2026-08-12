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
 */
export type TrustedRendererOrigin =
  | { readonly kind: 'file' }
  | { readonly kind: 'dev'; readonly origin: string };

/**
 * The trusted origin for this build: the dev server's origin when a renderer
 * dev URL is present, otherwise the packaged `file:` origin. A dev URL that
 * fails to parse falls back to `file:` rather than trusting a malformed value.
 */
export function resolveTrustedRendererOrigin(devUrl: string | undefined): TrustedRendererOrigin {
  if (!devUrl) return { kind: 'file' };
  try {
    return { kind: 'dev', origin: new URL(devUrl).origin };
  } catch {
    return { kind: 'file' };
  }
}

/**
 * True when `rawUrl` belongs to the renderer's own trusted origin. For a
 * packaged build that means the `file:` scheme (a `file:` URL has no
 * meaningful `origin` to compare); in dev it means an exact origin match, so a
 * different port or host is refused.
 */
export function isTrustedRendererUrl(rawUrl: string, trusted: TrustedRendererOrigin): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (trusted.kind === 'file') return url.protocol === 'file:';
  return url.origin === trusted.origin;
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
