import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CenterSwitchError } from '@centresoutien/domain';
import { CenterHost, type CenterSwapRuntime } from '../../src/main/center/center-host';
import type { Container } from '../../src/main/composition-root';
import type { CenterChangedEvent } from '../../src/shared/ipc/center-events';

type FakeContainerHooks = {
  onDispose?: () => void;
};

/**
 * The reduced host (SOU-96, unified onto `MainRuntime`) only ever reads a
 * container's `handlerDeps` (through `describe`) and delegates the mechanical
 * swap to the injected runtime. A hand-built stub carrying just those members is
 * enough to drive the center-specific concerns — short-circuit, whitelist,
 * failed-open conversion, and the out-of-band emit. The drain / reject-during-swap
 * / timeout machinery now lives in `MainRuntime` and is covered there. The single
 * `as unknown as Container` narrows the fake at this test-only boundary.
 */
function fakeContainer(centreId: string, hooks: FakeContainerHooks = {}): Container {
  const centerCode = `CS-${centreId}`;
  const handlerDeps = {
    currentCentreId: () => centreId,
    activeCenterCode: () => centerCode,
    getCenterProfile: { execute: () => Promise.resolve({ name: `Centre ${centreId}` }) },
  };
  return {
    handlerDeps,
    dispose: () => hooks.onDispose?.(),
  } as unknown as Container;
}

/**
 * A stand-in for the `MainRuntime` swap seam: it holds the live container and
 * performs the same build-then-dispose sequence, so a failing `build` leaves the
 * current container untouched (the failed-open guarantee `MainRuntime` owns).
 */
function fakeRuntime(initial: Container): CenterSwapRuntime {
  let current = initial;
  return {
    get currentCentreId() {
      return current.handlerDeps.currentCentreId();
    },
    get currentContainer() {
      return current;
    },
    swapTo: async (build: () => Container) => {
      const next = build();
      const previous = current;
      current = next;
      previous.dispose();
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CenterHost center-switch concerns (SOU-96)', () => {
  it('(e) short-circuits a switch to the already-open center without rebuilding', async () => {
    const buildForCenter = vi.fn((centreId: string) => fakeContainer(centreId));
    let aDisposed = false;
    const host = new CenterHost({
      runtime: fakeRuntime(fakeContainer('A', { onDispose: () => (aDisposed = true) })),
      buildForCenter,
      listInstalledCentreIds: () => ['A', 'B'],
      emitCenterChanged: () => {},
    });

    await host.swapTo('A');

    expect(buildForCenter).not.toHaveBeenCalled();
    expect(aDisposed).toBe(false);
    expect(host.currentCentreId).toBe('A');
  });

  it('(c) converts a failed target open to CenterSwitchError, leaving A intact', async () => {
    let aDisposed = false;
    const initial = fakeContainer('A', { onDispose: () => (aDisposed = true) });
    const host = new CenterHost({
      runtime: fakeRuntime(initial),
      buildForCenter: () => {
        throw new Error('cannot open target DB');
      },
      listInstalledCentreIds: () => ['A', 'B'],
      emitCenterChanged: () => {},
    });

    await expect(host.swapTo('B')).rejects.toBeInstanceOf(CenterSwitchError);

    expect(host.currentCentreId).toBe('A');
    expect(host.currentContainer).toBe(initial);
    expect(aDisposed).toBe(false);
  });

  it('(f) resolves a completed swap even when the center.changed emit throws (m1)', async () => {
    let aDisposed = false;
    const emitted: CenterChangedEvent[] = [];
    const host = new CenterHost({
      runtime: fakeRuntime(fakeContainer('A', { onDispose: () => (aDisposed = true) })),
      buildForCenter: (centreId) => fakeContainer(centreId),
      listInstalledCentreIds: () => ['A', 'B'],
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

  it('rejects a path-traversal center id before opening any DB (Greptile P1)', async () => {
    const buildForCenter = vi.fn((centreId: string) => fakeContainer(centreId));
    const swapTo = vi.fn(async (build: () => Container) => {
      build();
    });
    const runtime: CenterSwapRuntime = {
      currentCentreId: 'A',
      currentContainer: fakeContainer('A'),
      swapTo,
    };
    const host = new CenterHost({
      runtime,
      buildForCenter,
      listInstalledCentreIds: () => ['A', 'B'],
      emitCenterChanged: () => {},
    });

    for (const evil of ['../../evil', 'foo/bar', '..\\..\\evil', 'a\0b']) {
      await expect(host.swapTo(evil)).rejects.toBeInstanceOf(CenterSwitchError);
    }
    // A structurally valid id that is simply not installed is rejected too.
    await expect(host.swapTo('unknown')).rejects.toBeInstanceOf(CenterSwitchError);

    // No path was ever constructed and no DB opened — the whitelist ran first.
    expect(buildForCenter).not.toHaveBeenCalled();
    expect(swapTo).not.toHaveBeenCalled();
  });
});
