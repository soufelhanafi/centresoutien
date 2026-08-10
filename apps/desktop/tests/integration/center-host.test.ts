import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CenterSwitchError } from '@centresoutien/domain';
import { CenterHost } from '../../src/main/center/center-host';
import type { Container } from '../../src/main/composition-root';
import type { CenterChangedEvent } from '../../src/shared/ipc/center-events';

// DRAIN_TIMEOUT_MS in center-host.ts. Kept in sync by hand — the constant is
// module-private, and the drain-timeout case drives it with fake timers rather
// than waiting a real 5s.
const DRAIN_TIMEOUT_MS = 5000;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type FakeContainerHooks = {
  listStudents?: () => Promise<unknown[]>;
  switchCenter?: (request: { centreId: string }) => Promise<unknown>;
  emitBoom?: boolean;
  onDispose?: () => void;
};

/**
 * The host only ever touches a container's `handlerDeps` (through `createHandlers`
 * + `describe`) and its `dispose`. A hand-built stub carrying just those members
 * is enough to drive the whole swap state machine, so we never open a real
 * SQLCipher container to exercise drain / reject / timeout / failed-open. The
 * single `as unknown as Container` narrows the fake at this test-only boundary.
 */
function fakeContainer(centreId: string, hooks: FakeContainerHooks = {}): Container {
  const centerCode = `CS-${centreId}`;
  const handlerDeps = {
    envelopeContext: () => ({ centerCode, updatedBy: 'u', deviceOrigin: 'd' }),
    listStudents: { execute: hooks.listStudents ?? (() => Promise.resolve([])) },
    currentCentreId: () => centreId,
    activeCenterCode: () => centerCode,
    getCenterProfile: { execute: () => Promise.resolve({ name: `Centre ${centreId}` }) },
    switchCenter: {
      execute: hooks.switchCenter ?? (() => Promise.resolve({ ok: true, centreId })),
    },
  };
  return {
    handlerDeps,
    dispose: () => hooks.onDispose?.(),
  } as unknown as Container;
}

/** The host publishes a Proxy keyed by channel; index it dynamically for the test. */
function dispatch(host: CenterHost, channel: string, request: unknown = {}): Promise<unknown> {
  const handlers = host.ipcHandlers() as unknown as Record<
    string,
    (req: unknown) => Promise<unknown>
  >;
  return handlers[channel]!(request);
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CenterHost swap concurrency (SOU-193)', () => {
  it('(a) drains an in-flight call before disposing the previous container', async () => {
    const inFlight = createDeferred<unknown[]>();
    let aDisposed = false;
    const initial = fakeContainer('A', {
      listStudents: () => inFlight.promise,
      onDispose: () => {
        aDisposed = true;
      },
    });
    const host = new CenterHost({
      initial,
      initialCentreId: 'A',
      buildForCenter: (centreId) => fakeContainer(centreId),
      emitCenterChanged: () => {},
    });

    const outstanding = dispatch(host, 'student.list', { search: '' });
    const swap = host.swapTo('B');

    // The old DB handle must stay open while a query is outstanding.
    await Promise.resolve();
    expect(aDisposed).toBe(false);
    expect(host.currentCentreId).toBe('A');

    inFlight.resolve([]);
    await outstanding;
    await swap;

    expect(aDisposed).toBe(true);
    expect(host.currentCentreId).toBe('B');
  });

  it('(b) rejects new non-switch calls while swapping but exempts center.switch', async () => {
    const inFlight = createDeferred<unknown[]>();
    const initial = fakeContainer('A', { listStudents: () => inFlight.promise });
    const host = new CenterHost({
      initial,
      initialCentreId: 'A',
      buildForCenter: (centreId) => fakeContainer(centreId),
      emitCenterChanged: () => {},
    });

    const outstanding = dispatch(host, 'student.list', { search: '' });
    const swap = host.swapTo('B');

    await expect(dispatch(host, 'student.list', { search: '' })).rejects.toBeInstanceOf(
      CenterSwitchError,
    );
    // center.switch is uncounted: it drives the swap, so it must not self-deadlock
    // on the swapping guard.
    await expect(dispatch(host, 'center.switch', { centreId: 'C' })).resolves.toEqual({
      ok: true,
      centreId: 'A',
    });

    inFlight.resolve([]);
    await outstanding;
    await swap;
    expect(host.currentCentreId).toBe('B');
  });

  it('(c) leaves center A intact and queryable when opening the target fails', async () => {
    let aDisposed = false;
    const initial = fakeContainer('A', {
      onDispose: () => {
        aDisposed = true;
      },
    });
    const host = new CenterHost({
      initial,
      initialCentreId: 'A',
      buildForCenter: () => {
        throw new Error('cannot open target DB');
      },
      emitCenterChanged: () => {},
    });

    await expect(host.swapTo('B')).rejects.toBeInstanceOf(CenterSwitchError);

    expect(host.currentCentreId).toBe('A');
    expect(host.currentContainer).toBe(initial);
    expect(aDisposed).toBe(false);
    await expect(dispatch(host, 'student.list', { search: '' })).resolves.toEqual({ students: [] });
  });

  it('(d) refuses the switch when an in-flight call does not settle within the drain window', async () => {
    vi.useFakeTimers();
    try {
      const neverSettles = createDeferred<unknown[]>();
      let aDisposed = false;
      const initial = fakeContainer('A', {
        listStudents: () => neverSettles.promise,
        onDispose: () => {
          aDisposed = true;
        },
      });
      const host = new CenterHost({
        initial,
        initialCentreId: 'A',
        buildForCenter: (centreId) => fakeContainer(centreId),
        emitCenterChanged: () => {},
      });

      void dispatch(host, 'student.list', { search: '' });
      const swap = host.swapTo('B').catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(DRAIN_TIMEOUT_MS);

      expect(await swap).toBeInstanceOf(CenterSwitchError);
      expect(aDisposed).toBe(false);
      expect(host.currentCentreId).toBe('A');
    } finally {
      vi.useRealTimers();
    }
  });

  it('(e) short-circuits a switch to the already-open center without rebuilding', async () => {
    let aDisposed = false;
    const buildForCenter = vi.fn((centreId: string) => fakeContainer(centreId));
    const initial = fakeContainer('A', {
      onDispose: () => {
        aDisposed = true;
      },
    });
    const host = new CenterHost({
      initial,
      initialCentreId: 'A',
      buildForCenter,
      emitCenterChanged: () => {},
    });

    await host.swapTo('A');

    expect(buildForCenter).not.toHaveBeenCalled();
    expect(aDisposed).toBe(false);
    expect(host.currentCentreId).toBe('A');
  });

  it('(f) resolves a completed swap even when the center.changed emit throws (m1)', async () => {
    let aDisposed = false;
    const emitted: CenterChangedEvent[] = [];
    const initial = fakeContainer('A', {
      onDispose: () => {
        aDisposed = true;
      },
    });
    const host = new CenterHost({
      initial,
      initialCentreId: 'A',
      buildForCenter: (centreId) => fakeContainer(centreId),
      emitCenterChanged: (event) => {
        emitted.push(event);
        throw new Error('renderer notification failed');
      },
    });

    await expect(host.swapTo('B')).resolves.toBeUndefined();

    expect(host.currentCentreId).toBe('B');
    expect(aDisposed).toBe(true);
    expect(emitted).toEqual([{ centreId: 'B', centerCode: 'CS-B', displayName: 'Centre B' }]);
  });
});
