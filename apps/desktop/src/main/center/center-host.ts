import { CenterSwitchError } from '@centresoutien/domain';
import type { Container } from '../composition-root';
import { currentCenterSummary } from '../ipc/center-switch-handlers';
import type { CenterChangedEvent } from '../../shared/ipc/center-events';

/**
 * Structurally valid center-id charset (SOU-96 Greptile P1, defense in depth).
 * `centreId` becomes `centre-{id}.db` / `hub-{id}.db` under the userData dir, so a
 * renderer-supplied id with a path separator, `..`, or a NUL byte could probe or
 * create SQLCipher files OUTSIDE userData. The installed-center whitelist below is
 * the authoritative guard (an attacker cannot name a file that isn't there); this
 * regex rejects the obvious traversal shapes before the whitelist even runs.
 */
const SAFE_CENTRE_ID = /^[A-Za-z0-9_-]+$/;

/**
 * The mechanical hot-swap primitive {@link CenterHost} drives. Implemented by
 * `MainRuntime`, which owns the live container + `ipcMain` delegation for the
 * whole process; the center switcher is one of its two triggers (the demo toggle
 * is the other). Kept as a narrow structural seam so the host unit-tests without
 * a real `MainRuntime` or an Electron `ipcMain`.
 */
export type CenterSwapRuntime = {
  readonly currentCentreId: string;
  readonly currentContainer: Container;
  swapTo(build: () => Container): Promise<void>;
};

export type CenterHostOptions = {
  runtime: CenterSwapRuntime;
  /** Opens + migrates the target center's DB and wires a fresh container for it.
   *  Throws if the target cannot be opened — the host converts that to a
   *  `CenterSwitchError` and (via the runtime) leaves the current center untouched. */
  buildForCenter: (centreId: string) => Container;
  /** The `centreId`s of the centers actually installed on this machine (the
   *  userData `centre-*.db` scan, demo excluded). The switch target MUST be one of
   *  these — the Greptile P1 path-traversal whitelist. */
  listInstalledCentreIds: () => readonly string[];
  emitCenterChanged: (event: CenterChangedEvent) => void;
};

/**
 * The center-switcher trigger for the app shell (SOU-96). It owns only the
 * center-specific concerns — the installed-center whitelist, the same-center
 * short-circuit, and the `center.changed` emit — and delegates the mechanical
 * close-one / open-another swap (drain in-flight work, build the target, dispose
 * the previous DB handle) to the injected {@link CenterSwapRuntime}. That runtime
 * is the single owner of the live container and the `ipcMain` delegation, so a
 * switch never has to unwire/rewire `ipcMain`, and the demo toggle and the center
 * switch share one hot-swap mechanism instead of two.
 *
 * A switch = close-one / open-another (CLAUDE.md §5ter — the center is the tenant,
 * one DB file each). The runtime disposes the previous container only AFTER the
 * new one is open, so a failed open never leaves the app center-less.
 */
export class CenterHost {
  constructor(private readonly options: CenterHostOptions) {}

  get currentContainer(): Container {
    return this.options.runtime.currentContainer;
  }

  get currentCentreId(): string {
    return this.options.runtime.currentCentreId;
  }

  swapTo = async (centreId: string): Promise<void> => {
    if (centreId === this.options.runtime.currentCentreId) return;
    this.assertInstalledCenter(centreId);
    await this.options.runtime.swapTo(() => this.openTarget(centreId));
    // Past the point of no return: `centreId` is now the open center. Computing or
    // emitting `center.changed` reads its DB, so it can fail — but a failed
    // notification must NOT re-report an already-committed swap as rejected, or
    // the renderer's onSuccess never runs and it keeps showing the previous center
    // while the backend serves the new one (a cross-tenant display risk).
    await this.announceOpenCenter(centreId);
  };

  /**
   * Greptile P1 (path traversal). The requested `centreId` flows into
   * `centre-{id}.db` / `hub-{id}.db` path construction; validate it BEFORE any
   * path is built or any DB is opened. Authoritative check: it must be one of the
   * centers actually discovered on disk — an id that names no installed file is
   * rejected here, so a traversal id can never reach `openTarget`. The structural
   * regex is defense in depth for the same class of input.
   */
  private assertInstalledCenter(centreId: string): void {
    if (!SAFE_CENTRE_ID.test(centreId)) {
      throw new CenterSwitchError(`invalid center id "${centreId}"`);
    }
    if (!this.options.listInstalledCentreIds().includes(centreId)) {
      throw new CenterSwitchError(`center "${centreId}" is not installed`);
    }
  }

  private openTarget(centreId: string): Container {
    try {
      return this.options.buildForCenter(centreId);
    } catch (error) {
      console.error('[center-switch] failed to open center', centreId, error);
      throw new CenterSwitchError(`center "${centreId}" could not be opened`);
    }
  }

  private async announceOpenCenter(centreId: string): Promise<void> {
    try {
      this.options.emitCenterChanged(await this.describe(this.options.runtime.currentContainer));
    } catch (error) {
      console.error('[center-switch] swap completed but center.changed emit failed', centreId, error);
    }
  }

  private async describe(container: Container): Promise<CenterChangedEvent> {
    return currentCenterSummary({
      currentCentreId: container.handlerDeps.currentCentreId,
      activeCenterCode: container.handlerDeps.activeCenterCode,
      getCenterProfile: container.handlerDeps.getCenterProfile,
    });
  }
}
