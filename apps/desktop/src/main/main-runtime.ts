import type { IpcMain } from 'electron';
import type { Database as DB } from 'better-sqlite3';
import { ipcContract } from '../shared/ipc/contract';
import type { IpcChannel } from '../shared/ipc/contract';
import { createIpcDispatcher, type IpcDispatcherOptions } from './ipc/dispatcher';
import { createHandlers } from './ipc/handlers';
import type { Container } from './composition-root';

/** The slice of {@link IpcMain} this runtime uses — only channel registration. */
type IpcRegistrar = Pick<IpcMain, 'handle'>;

/**
 * Holds the open center's {@link Container} and routes every IPC channel to it
 * through one validated dispatcher. The channels are registered on `ipcMain`
 * exactly once, at construction; a demo hot-swap (SOU-186) rebuilds the
 * dispatcher against the next container and reassigns the field the registered
 * handlers close over, so the OS process never restarts and the `ipcMain.handle`
 * bindings are never re-registered.
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

  constructor(ipcMain: IpcRegistrar, initial: Container) {
    this.current = initial;
    const handlers = createHandlers(initial.handlerDeps);
    this.dispatch = createIpcDispatcher(handlers, gatesFor(initial));
    for (const channel of Object.keys(ipcContract) as IpcChannel[]) {
      if (!(channel in handlers)) continue;
      ipcMain.handle(channel, (_event, rawRequest: unknown) => this.dispatch(channel, rawRequest));
    }
  }

  get currentDb(): DB {
    return this.current.db;
  }

  readLocalePreference() {
    return this.current.readLocalePreference();
  }

  /**
   * Swap the open center to the one `build` opens: build the target container
   * (opens + migrates its DB), point the dispatcher at it, then dispose the
   * previous one — closing its DB handle cleanly. If `build` throws (bad key,
   * missing file, migration guard) the current container is untouched and the
   * rejection propagates to the caller, so a failed swap surfaces as an IPC
   * error instead of taking the main process down (SOU-186).
   */
  async swapTo(build: () => Container): Promise<void> {
    const next = build();
    const previous = this.current;
    this.current = next;
    this.dispatch = createIpcDispatcher(createHandlers(next.handlerDeps), gatesFor(next));
    // Safe for the manual demo toggle; revisit before reusing this seam for SOU-96 multi-center switching.
    previous.dispose();
  }

  dispose(): void {
    this.current.dispose();
  }
}

function gatesFor(container: Container): IpcDispatcherOptions {
  return { isRestricted: container.isRestricted, isSetupComplete: container.isSetupComplete };
}
