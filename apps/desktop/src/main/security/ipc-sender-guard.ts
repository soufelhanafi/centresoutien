import type { IpcMainInvokeEvent } from 'electron';
import { isTrustedIpcSender, type TrustedRendererOrigin } from './renderer-origin';

/** Thrown when an IPC invocation arrives from a subframe or an unexpected origin. */
export class UntrustedIpcSenderError extends Error {
  constructor() {
    super('IPC call rejected: untrusted sender frame or origin');
    this.name = 'UntrustedIpcSenderError';
  }
}

/** Asserts the invoking frame is trusted, throwing {@link UntrustedIpcSenderError} otherwise. */
export type IpcSenderGuard = (event: IpcMainInvokeEvent) => void;

/**
 * Builds the guard the single IPC registration path (`MainRuntime`) runs before
 * every channel dispatch. It reads the live `senderFrame` — its URL and whether
 * it has a parent — and defers the trust decision to the pure
 * {@link isTrustedIpcSender} predicate, so only the top frame of the renderer's
 * own origin may invoke any channel (SOU-236).
 */
export function createIpcSenderGuard(trusted: TrustedRendererOrigin): IpcSenderGuard {
  return (event) => {
    const frame = event.senderFrame;
    const context = frame ? { url: frame.url, hasParent: frame.parent !== null } : null;
    if (!isTrustedIpcSender(context, trusted)) throw new UntrustedIpcSenderError();
  };
}
