import type { Page } from '@playwright/test';
import type { DesktopApi } from '../../../src/shared/ipc/api';
import type { IpcChannel, IpcResponse } from '../../../src/shared/ipc/contract';

type ChannelOutcome<C extends IpcChannel> =
  | { readonly kind: 'ok'; readonly value: IpcResponse<C> }
  | { readonly kind: 'error'; readonly message: string };

/**
 * Every channel the visual harness may need to answer, keyed exactly like
 * `IpcContract` so a mocked response can never drift from the real IPC
 * response shape (imported, not duplicated — CLAUDE.md §13).
 */
export type MockTable = { [C in IpcChannel]?: ChannelOutcome<C> };

export function ok<C extends IpcChannel>(value: IpcResponse<C>): ChannelOutcome<C> {
  return { kind: 'ok', value };
}

export function fails<C extends IpcChannel>(message: string): ChannelOutcome<C> {
  return { kind: 'error', message };
}

/**
 * The four channels every screen calls at boot, regardless of which screen
 * is under test: `FirstRunGate` (`admin.exists`), `AuthGate` (`auth.session`),
 * the SOU-104 license lock (`license.status`), and `usePlanHydration`
 * (`plan.get`). Merge screen-specific entries on top.
 */
export function bootMocks(planId: IpcResponse<'plan.get'>['planId'] = 'premium'): MockTable {
  return {
    'admin.exists': ok({ exists: true }),
    'auth.session': ok({ authenticated: true }),
    'license.status': ok({
      status: 'active',
      plan: planId,
      restricted: false,
      expiresAt: null,
      centersAllowed: null,
      founderDiscountExpiresAt: null,
      founderDiscountExpired: false,
    }),
    'plan.get': ok({ planId }),
  };
}

/**
 * Replaces `window.api` with a fully offline, fully deterministic stub before
 * any of the app's own scripts run (SOU-146). This is a plain browser page —
 * not Electron — so there is no `contextBridge` isolation to fight; the object
 * assigned here is the real, mutable `window.api` the renderer calls.
 *
 * Unregistered channels reject loudly (instead of hanging or silently
 * returning `undefined`) so a screen that needs a channel the test forgot to
 * mock fails fast with a readable error, rather than producing a misleading
 * screenshot.
 */
export async function installMockBridge(page: Page, table: MockTable): Promise<void> {
  await page.addInitScript((serializedTable: MockTable) => {
    // `request` is intentionally unused: this stub answers purely by
    // channel name (see `MockTable`), the same fixed response regardless of
    // what the caller sent.
    const invoke = (channel: IpcChannel): Promise<unknown> => {
      const outcome = serializedTable[channel];
      if (!outcome) {
        return Promise.reject(new Error(`visual harness: no mock registered for IPC channel "${channel}"`));
      }
      return outcome.kind === 'error' ? Promise.reject(new Error(outcome.message)) : Promise.resolve(outcome.value);
    };
    /**
     * `window.api` is declared read-only and per-channel generic in
     * `renderer/window.d.ts` for the real `contextBridge` build. This harness
     * loads the built renderer bundle as a plain page — no Electron, no
     * preload — so this stub is the only thing satisfying that contract here.
     * The single cast below (allowed for test code, CLAUDE.md §13) is where
     * the per-channel typing collapses to `unknown`; the real type safety is
     * upstream, in `ok()`/`fails()` checking each mocked value against the
     * real `IpcResponse<C>` at the call site in every spec.
     */
    (window as unknown as { api: DesktopApi }).api = { invoke } as unknown as DesktopApi;
  }, table);
}
