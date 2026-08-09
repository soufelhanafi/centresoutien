import { CenterSwitchError } from '@centresoutien/domain';
import type { Container } from '../composition-root';
import { createHandlers } from '../ipc/handlers';
import { currentCenterSummary } from '../ipc/center-switch-handlers';
import type { IpcChannel, RegisterableIpcHandlers } from '../../shared/ipc/contract';
import type { CenterChangedEvent } from '../../shared/ipc/center-events';

const DRAIN_POLL_MS = 5;
const DRAIN_TIMEOUT_MS = 5000;

/**
 * `center.switch` is the one channel exempt from in-flight counting: it is the
 * call that DRIVES the swap, so counting it would deadlock the drain (the drain
 * would wait for the switch call that is waiting for the drain).
 */
const UNCOUNTED_CHANNELS: ReadonlySet<string> = new Set<IpcChannel>(['center.switch']);

export type CenterHostOptions = {
  initial: Container;
  initialCentreId: string;
  /** Opens + migrates the target center's DB and wires a fresh container for it.
   *  Throws if the target cannot be opened — the host converts that to a
   *  `CenterSwitchError` and leaves the current center untouched. */
  buildForCenter: (centreId: string) => Container;
  emitCenterChanged: (event: CenterChangedEvent) => void;
};

/**
 * Owns the live, in-process center hot-swap for the app shell (SOU-96). The
 * Electron main process registers `host.ipcHandlers()` with `ipcMain` ONCE; every
 * dispatch is delegated to whichever container is currently open, so a switch
 * never has to unwire/rewire `ipcMain`.
 *
 * A switch = close-one / open-another (CLAUDE.md §5ter — the center is the tenant,
 * one DB file each): drain in-flight work, build the target container, atomically
 * point the delegation at it, then dispose the previous one (closing its DB). The
 * previous container is disposed only AFTER the new one is open, so a failed open
 * never leaves the app center-less.
 *
 * Concurrency (SOU-193): the desktop is single-operator. New non-switch calls are
 * rejected while a switch is in progress, and the drain waits for any call already
 * running to settle before the old DB is closed — so an in-flight query can never
 * hit a half-closed handle. If a call somehow does not settle within the drain
 * window the switch is refused (never forced), because disposing a DB out from
 * under a live query is the exact use-after-free hazard SOU-193 guards against.
 */
export class CenterHost {
  private container: Container;
  private handlers: RegisterableIpcHandlers;
  private centreId: string;
  private inFlight = 0;
  private swapping = false;

  constructor(private readonly options: CenterHostOptions) {
    this.container = options.initial;
    this.handlers = createHandlers(options.initial.handlerDeps);
    this.centreId = options.initialCentreId;
  }

  get currentContainer(): Container {
    return this.container;
  }

  get currentCentreId(): string {
    return this.centreId;
  }

  isRestricted = (): boolean => this.container.isRestricted();
  isSetupComplete = (): boolean => this.container.isSetupComplete();

  /**
   * A stable handler map for `registerIpc`. Every channel delegates to the
   * currently-open container's handler; non-switch calls are wrapped with
   * in-flight tracking and rejected while a swap runs. Registered once — the
   * delegation, not `ipcMain`, is what changes on a switch.
   */
  ipcHandlers(): RegisterableIpcHandlers {
    return new Proxy({} as RegisterableIpcHandlers, {
      has: (_target, channel) => typeof channel === 'string' && channel in this.handlers,
      get: (_target, channel) => {
        if (typeof channel !== 'string' || !(channel in this.handlers)) return undefined;
        return this.wrap(channel);
      },
    });
  }

  private wrap(channel: string) {
    return async (request: unknown): Promise<unknown> => {
      const handler = (this.handlers as Record<string, ((req: unknown) => unknown) | undefined>)[
        channel
      ];
      if (!handler) throw new Error(`No handler registered for IPC channel: ${channel}`);
      if (UNCOUNTED_CHANNELS.has(channel)) return handler(request);
      if (this.swapping) throw new CenterSwitchError('a center switch is in progress');
      this.inFlight += 1;
      try {
        return await handler(request);
      } finally {
        this.inFlight -= 1;
      }
    };
  }

  swapTo = async (centreId: string): Promise<void> => {
    if (centreId === this.centreId) return;
    if (this.swapping) throw new CenterSwitchError('a center switch is already in progress');
    this.swapping = true;
    try {
      await this.drain();
      const next = this.openTarget(centreId);
      const previous = this.container;
      this.container = next;
      this.handlers = createHandlers(next.handlerDeps);
      this.centreId = centreId;
      previous.dispose();
      this.options.emitCenterChanged(await this.describe(next));
    } finally {
      this.swapping = false;
    }
  };

  private openTarget(centreId: string): Container {
    try {
      return this.options.buildForCenter(centreId);
    } catch (error) {
      console.error('[center-switch] failed to open center', centreId, error);
      throw new CenterSwitchError(`center "${centreId}" could not be opened`);
    }
  }

  private async describe(container: Container): Promise<CenterChangedEvent> {
    return currentCenterSummary({
      currentCentreId: container.handlerDeps.currentCentreId,
      activeCenterCode: container.handlerDeps.activeCenterCode,
      getCenterProfile: container.handlerDeps.getCenterProfile,
    });
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
