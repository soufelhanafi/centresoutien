import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { Database as DB } from 'better-sqlite3';
import { CenterSwitchError } from '@centresoutien/domain';
import { ipcContract } from '../shared/ipc/contract';
import type { IpcChannel } from '../shared/ipc/contract';
import { createIpcDispatcher, type IpcDispatcherOptions } from './ipc/dispatcher';
import { createHandlers } from './ipc/handlers';
import type { IpcSenderGuard } from './security/ipc-sender-guard';
import type { Container } from './composition-root';

/** The slice of {@link IpcMain} this runtime uses — only channel registration. */
type IpcRegistrar = Pick<IpcMain, 'handle'>;

const DRAIN_POLL_MS = 5;
const DRAIN_TIMEOUT_MS = 5000;

/**
 * The channels that DRIVE a container hot-swap — the demo toggle (SOU-186) and
 * the center switcher (SOU-96). They are exempt from in-flight counting AND the
 * "swap in progress" guard: each is the very call that performs the swap, so
 * counting it would deadlock its own drain (the drain would wait for the call
 * that is waiting for the drain) and the guard would reject the call performing
 * the swap. Every OTHER channel is counted and blocked while a swap runs so a
 * live query can never hit a half-closed SQLite handle.
 */
const SWAP_DRIVING_CHANNELS: ReadonlySet<string> = new Set<IpcChannel>([
  'demo.create',
  'demo.wipe',
  'center.switch',
]);

/**
 * Holds the open center's {@link Container} and routes every IPC channel to it
 * through one validated dispatcher. The channels are registered on `ipcMain`
 * exactly once, at construction; a hot-swap (demo toggle SOU-186, center switch
 * SOU-96) rebuilds the dispatcher against the next container and reassigns the
 * field the registered handlers close over, so the OS process never restarts and
 * the `ipcMain.handle` bindings are never re-registered.
 *
 * This is the single owner of "the live container" and of the `ipcMain`
 * delegation for the whole main process — both the demo toggle and the center
 * switcher route their swap through {@link swapTo}. The center-specific concerns
 * (directory whitelist, `center.changed` emit) live in `CenterHost`, which
 * delegates the mechanical swap here.
 *
 * The set of present channels is a build-time constant across containers (the
 * only conditional handlers — the DEV-only `plan.set` and the e2e-only
 * `sync.test.seedConflict` — are gated by static flags identical in one process),
 * so registering from the initial container's handler set stays correct after
 * every swap.
 */
export class MainRuntime {
  private current: Container;
  private dispatch: ReturnType<typeof createIpcDispatcher>;
  private inFlight = 0;
  private swapping = false;

  /**
   * `senderGuard` validates the invoking frame before every dispatch — the
   * single choke point for sender/frame validation (SOU-236). Required, not
   * optional: making it mandatory means no caller can silently register the IPC
   * channels without sender validation. Tests that only exercise routing pass an
   * allow-all guard explicitly.
   */
  constructor(ipcMain: IpcRegistrar, initial: Container, senderGuard: IpcSenderGuard) {
    this.current = initial;
    const handlers = createHandlers(initial.handlerDeps);
    this.dispatch = createIpcDispatcher(handlers, gatesFor(initial));
    for (const channel of Object.keys(ipcContract) as IpcChannel[]) {
      if (!(channel in handlers)) continue;
      ipcMain.handle(channel, async (event: IpcMainInvokeEvent, rawRequest: unknown) => {
        senderGuard(event);
        return this.route(channel, rawRequest);
      });
    }
  }

  private async route(channel: IpcChannel, rawRequest: unknown): Promise<unknown> {
    if (SWAP_DRIVING_CHANNELS.has(channel)) return this.dispatch(channel, rawRequest);
    if (this.swapping) throw new CenterSwitchError('a center switch is in progress');
    this.inFlight += 1;
    try {
      return await this.dispatch(channel, rawRequest);
    } finally {
      this.inFlight -= 1;
    }
  }

  get currentDb(): DB {
    return this.current.db;
  }

  get currentContainer(): Container {
    return this.current;
  }

  get currentCentreId(): string {
    return this.current.handlerDeps.currentCentreId();
  }

  readLocalePreference() {
    return this.current.readLocalePreference();
  }

  /**
   * Swap the open center to the one `build` opens: drain any in-flight call so no
   * live query hits a closing handle, build the target container (opens +
   * migrates its DB), point the dispatcher at it, then dispose the previous one —
   * closing its DB handle cleanly and stopping its embedded hub. The new
   * container is built BEFORE the previous one is disposed, so if `build` throws
   * (bad key, missing file, migration guard) the current container is untouched
   * and the rejection propagates to the caller — a failed swap surfaces as an IPC
   * error instead of leaving the app center-less or taking the main process down
   * (SOU-186). A second overlapping swap is rejected rather than interleaved
   * (SOU-193 — the desktop is single-operator).
   */
  async swapTo(build: () => Container): Promise<void> {
    if (this.swapping) throw new CenterSwitchError('a center switch is already in progress');
    this.swapping = true;
    try {
      await this.drain();
      const next = build();
      const previous = this.current;
      this.current = next;
      this.dispatch = createIpcDispatcher(createHandlers(next.handlerDeps), gatesFor(next));
      previous.dispose();
    } finally {
      this.swapping = false;
    }
  }

  dispose(): void {
    this.current.dispose();
  }

  private async drain(): Promise<void> {
    const deadline = Date.now() + DRAIN_TIMEOUT_MS;
    while (this.inFlight > 0) {
      if (Date.now() >= deadline) {
        throw new CenterSwitchError('center is busy — please retry the switch');
      }
      await delay(DRAIN_POLL_MS);
    }
  }
}

function gatesFor(container: Container): IpcDispatcherOptions {
  return { isRestricted: container.isRestricted, isSetupComplete: container.isSetupComplete };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
