import { describe, expect, it } from 'vitest';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import {
  createIpcSenderGuard,
  isTrustedIpcEvent,
  UntrustedIpcSenderError,
} from '../../../src/main/security/ipc-sender-guard';
import type { TrustedRendererOrigin } from '../../../src/main/security/renderer-origin';

/**
 * SOU-236 — the Electron-facing guard the single IPC registration path runs
 * before every dispatch. It only reads `senderFrame`, so a fake frame drives it
 * without a real `WebFrameMain`; the trust logic itself is covered pure in
 * renderer-origin.test.ts.
 */

const DEV: TrustedRendererOrigin = { kind: 'dev', origin: 'http://localhost:5173' };

/** A fake invoke event carrying only the `senderFrame` shape the guard inspects. */
function eventWithFrame(frame: { url: string; parent: unknown } | null): IpcMainInvokeEvent {
  return { senderFrame: frame } as unknown as IpcMainInvokeEvent;
}

describe('createIpcSenderGuard', () => {
  const guard = createIpcSenderGuard(DEV);

  it('passes an invocation from the top frame of the trusted origin', () => {
    expect(() => guard(eventWithFrame({ url: 'http://localhost:5173/', parent: null }))).not.toThrow();
  });

  it('rejects a subframe (parent present) even on the trusted origin', () => {
    expect(() => guard(eventWithFrame({ url: 'http://localhost:5173/', parent: {} }))).toThrow(
      UntrustedIpcSenderError,
    );
  });

  it('rejects a top frame on a foreign origin', () => {
    expect(() => guard(eventWithFrame({ url: 'https://evil.com', parent: null }))).toThrow(
      UntrustedIpcSenderError,
    );
  });

  it('rejects an event with no sender frame', () => {
    expect(() => guard(eventWithFrame(null))).toThrow(UntrustedIpcSenderError);
  });
});

describe('isTrustedIpcEvent', () => {
  it('screens a send/on event (IpcMainEvent) the same way, without throwing', () => {
    const trusted = { url: 'http://localhost:5173/', parent: null };
    const untrusted = { url: 'http://localhost:5173/', parent: {} };
    expect(isTrustedIpcEvent({ senderFrame: trusted } as unknown as IpcMainEvent, DEV)).toBe(true);
    expect(isTrustedIpcEvent({ senderFrame: untrusted } as unknown as IpcMainEvent, DEV)).toBe(false);
    expect(isTrustedIpcEvent({ senderFrame: null } as unknown as IpcMainEvent, DEV)).toBe(false);
  });
});
