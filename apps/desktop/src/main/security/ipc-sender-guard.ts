import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { isTrustedIpcSender, type TrustedRendererOrigin } from './renderer-origin';

/** Thrown when an IPC invocation arrives from a subframe or an unexpected origin. */
export class UntrustedIpcSenderError extends Error {
  constructor() {
    super('IPC call rejected: untrusted sender frame or origin');
    this.name = 'UntrustedIpcSenderError';
  }
}

/**
 * True when the invoking frame is the top frame of the renderer's own origin.
 * Works for both `invoke`/`handle` and `send`/`on` events — both expose
 * `senderFrame`. Returns a boolean (no throw), so `.on` listeners that must not
 * crash the main process can screen their sender before acting (SOU-236).
 */
export function isTrustedIpcEvent(
  event: IpcMainInvokeEvent | IpcMainEvent,
  trusted: TrustedRendererOrigin,
): boolean {
  // A WebFrameMain can be non-null yet throw on property access once its render
  // frame has navigated away or been destroyed (e.g. a slow invoke resolving
  // after the sender unloaded). Treat any such access failure as untrusted —
  // fail closed rather than leak an unexpected error type past the guard.
  try {
    const frame = event.senderFrame;
    const context = frame ? { url: frame.url, hasParent: frame.parent !== null } : null;
    return isTrustedIpcSender(context, trusted);
  } catch {
    return false;
  }
}

/** Asserts the invoking frame is trusted, throwing {@link UntrustedIpcSenderError} otherwise. */
export type IpcSenderGuard = (event: IpcMainInvokeEvent) => void;

/**
 * Builds the guard the single `invoke`/`handle` registration path (`MainRuntime`)
 * runs before every channel dispatch, so only the top frame of the renderer's
 * own origin may invoke any channel (SOU-236).
 */
export function createIpcSenderGuard(trusted: TrustedRendererOrigin): IpcSenderGuard {
  return (event) => {
    if (!isTrustedIpcEvent(event, trusted)) throw new UntrustedIpcSenderError();
  };
}
