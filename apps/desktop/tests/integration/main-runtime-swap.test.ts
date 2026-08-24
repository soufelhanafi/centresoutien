import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IpcMain } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CenterSwitchError, type CenterCode, type PlanId, type SubjectId } from '@centresoutien/domain';
import { buildContainer, type Container } from '../../src/main/composition-root';
import { MainRuntime } from '../../src/main/main-runtime';
import type { IpcSenderGuard } from '../../src/main/security/ipc-sender-guard';
import type { IpcChannel, IpcRequest, IpcResponse } from '../../src/shared/ipc/contract';

/** These tests exercise routing/hot-swap, not sender validation, so the guard is a no-op. */
const ALLOW_ALL_SENDER: IpcSenderGuard = () => {};

/**
 * SOU-96 — the center hot-swap seam. `MainRuntime` registers every IPC channel
 * once and reroutes them to whichever container is open, so a center switch
 * closes the current SQLCipher handle and opens the target IN-PROCESS —
 * no `app.relaunch` / `app.exit`. These tests drive the seam directly with real
 * containers over temp SQLCipher files; the E2E suite exercises it through the UI.
 */

const KEY = 'passphrase-under-test';
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-runtime-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function openCenter(centreId: string, centerCode: string, planId: PlanId): Container {
  return buildContainer({
    centreId,
    centerCode: centerCode as CenterCode,
    key: KEY,
    dir,
    tempDir: dir,
    planId,
    appVersion: () => '2.0.0',
    scheduleRestart: () => {},
  });
}

/** A fake `ipcMain` that records the handler registered per channel so the test can invoke it. */
function recordingIpcMain(): {
  ipcMain: Pick<IpcMain, 'handle'>;
  invoke: <C extends IpcChannel>(channel: C, request: IpcRequest<C>) => Promise<IpcResponse<C>>;
} {
  const registry = new Map<string, (event: unknown, request: unknown) => unknown>();
  const ipcMain = {
    handle(channel: string, listener: (event: unknown, request: unknown) => unknown) {
      registry.set(channel, listener);
    },
  } as Pick<IpcMain, 'handle'>;
  return {
    ipcMain,
    invoke: <C extends IpcChannel>(channel: C, request: IpcRequest<C>) => {
      const listener = registry.get(channel);
      if (!listener) throw new Error(`channel not registered: ${channel}`);
      return Promise.resolve(listener(null, request)) as Promise<IpcResponse<C>>;
    },
  };
}

describe('MainRuntime center hot-swap', () => {
  it('reroutes IPC to the swapped center and closes the previous DB handle without a restart', async () => {
    const real = openCenter('C1', 'CS-CASA-001', 'essentiel');
    const { ipcMain, invoke } = recordingIpcMain();
    const runtime = new MainRuntime(ipcMain, real, ALLOW_ALL_SENDER);

    // A subject created in the real center is scoped to its DB + centerCode.
    await invoke('subject.create', { name: { fr: 'Maths', ar: 'الرياضيات' } });
    expect((await invoke('plan.get', {})).planId).toBe('essentiel');
    expect(real.db.open).toBe(true);

    const target = openCenter('C2', 'CS-RABAT-002', 'premium');
    await runtime.swapTo(() => target);

    // The previous handle is closed cleanly — the whole point of SOU-186 is that
    // this happens WITHOUT tearing the OS process down.
    expect(real.db.open).toBe(false);
    expect(target.db.open).toBe(true);
    // Routing followed the swap: the plan is now the target center's, and the
    // target is a distinct DB + centerCode, so the real center's subject is not
    // visible here (the bare-db-swap bug this design avoids).
    expect((await invoke('plan.get', {})).planId).toBe('premium');
    expect((await invoke('subject.list', { scope: 'all' })).subjects).toHaveLength(0);

    runtime.dispose();
    expect(target.db.open).toBe(false);
  });

  it('routes a write to the swapped center, isolated from the previous one', async () => {
    const real = openCenter('C1', 'CS-CASA-001', 'premium');
    const { ipcMain, invoke } = recordingIpcMain();
    const runtime = new MainRuntime(ipcMain, real, ALLOW_ALL_SENDER);

    const target = openCenter('C2', 'CS-RABAT-002', 'premium');
    await runtime.swapTo(() => target); // disposes the real container
    const { id } = await invoke('subject.create', { name: { fr: 'Physique', ar: 'الفيزياء' } });

    // The write landed in the target center only.
    const listed = (await invoke('subject.list', { scope: 'all' })).subjects;
    expect(listed.map((s) => s.id)).toContain(id as SubjectId);

    runtime.dispose();

    // The real center never received it — reopen its DB fresh and confirm empty.
    const reopened = recordingIpcMain();
    const runtime2 = new MainRuntime(reopened.ipcMain, openCenter("C1", "CS-CASA-001", "premium"), ALLOW_ALL_SENDER);
    expect((await reopened.invoke('subject.list', { scope: 'all' })).subjects).toHaveLength(0);
    runtime2.dispose();
  });

  it('keeps the current center live when the swap fails — no crash', async () => {
    const real = openCenter('C1', 'CS-CASA-001', 'essentiel');
    const { ipcMain, invoke } = recordingIpcMain();
    const runtime = new MainRuntime(ipcMain, real, ALLOW_ALL_SENDER);

    await expect(
      runtime.swapTo(() => {
        throw new Error('failed to open target DB');
      }),
    ).rejects.toThrow('failed to open target DB');

    // The failed swap left the real center open and serving — an uncaught error
    // during the DB swap must never take main down (the SOU-186 regression).
    expect(real.db.open).toBe(true);
    expect((await invoke('plan.get', {})).planId).toBe('essentiel');

    runtime.dispose();
  });
});

// DRAIN_TIMEOUT_MS in main-runtime.ts. Kept in sync by hand — the constant is
// module-private; the drain-timeout case drives it with fake timers rather than
// waiting a real 5s.
const DRAIN_TIMEOUT_MS = 5000;

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

type FakeContainerHooks = {
  listStudents?: () => Promise<unknown[]>;
  onDispose?: () => void;
};

/**
 * SOU-193 concurrency (drain / reject-during-swap / timeout) now lives in
 * `MainRuntime`. Driving it needs an IPC call whose handler can HANG, which real
 * SQLCipher containers cannot do, so these cases use a hand-built container stub
 * carrying only the `handlerDeps` the exercised channels read. The single
 * `as unknown as Container` narrows the fake at this test-only boundary.
 */
function fakeContainer(centreId: string, hooks: FakeContainerHooks = {}): Container {
  const centerCode = `CS-${centreId}`;
  const handlerDeps = {
    envelopeContext: () => ({ centerCode, updatedBy: 'u', deviceOrigin: 'd' }),
    listStudents: { execute: hooks.listStudents ?? (() => Promise.resolve([])) },
    currentCentreId: () => centreId,
    activeCenterCode: () => centerCode,
    listCenters: () => Promise.resolve([]),
    getCenterProfile: { execute: () => Promise.resolve({ name: `Centre ${centreId}` }) },
    switchCenter: { execute: () => Promise.resolve({ ok: true, centreId }) },
    createCenter: { execute: () => Promise.resolve({ ok: true, centreId, centerCode }) },
  };
  return {
    handlerDeps,
    isRestricted: () => false,
    isSetupComplete: () => true,
    readLocalePreference: () => undefined,
    dispose: () => hooks.onDispose?.(),
  } as unknown as Container;
}

/** A fake `ipcMain` recording the handler per channel so the test can invoke it. */
function recordingRuntime(initial: Container): {
  runtime: MainRuntime;
  invoke: (channel: IpcChannel, request: unknown) => Promise<unknown>;
} {
  const registry = new Map<string, (event: unknown, request: unknown) => unknown>();
  const ipcMain = {
    handle(channel: string, listener: (event: unknown, request: unknown) => unknown) {
      registry.set(channel, listener);
    },
  } as Pick<IpcMain, 'handle'>;
  const runtime = new MainRuntime(ipcMain, initial, ALLOW_ALL_SENDER);
  return {
    runtime,
    invoke: (channel, request) => {
      const listener = registry.get(channel);
      if (!listener) throw new Error(`channel not registered: ${channel}`);
      return Promise.resolve(listener(null, request));
    },
  };
}

describe('MainRuntime swap concurrency (SOU-193)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(a) drains an in-flight call before disposing the previous container', async () => {
    const inFlight = createDeferred<unknown[]>();
    let aDisposed = false;
    const { runtime, invoke } = recordingRuntime(
      fakeContainer('A', {
        listStudents: () => inFlight.promise,
        onDispose: () => (aDisposed = true),
      }),
    );

    const outstanding = invoke('student.list', { search: '' });
    const swap = runtime.swapTo(() => fakeContainer('B'));

    await Promise.resolve();
    expect(aDisposed).toBe(false);
    expect(runtime.currentCentreId).toBe('A');

    inFlight.resolve([]);
    await outstanding;
    await swap;

    expect(aDisposed).toBe(true);
    expect(runtime.currentCentreId).toBe('B');
  });

  it('(b) rejects new non-swap calls while swapping but exempts the swap-driving channels', async () => {
    const inFlight = createDeferred<unknown[]>();
    const { runtime, invoke } = recordingRuntime(
      fakeContainer('A', { listStudents: () => inFlight.promise }),
    );

    const outstanding = invoke('student.list', { search: '' });
    const swap = runtime.swapTo(() => fakeContainer('B'));

    await expect(invoke('student.list', { search: '' })).rejects.toBeInstanceOf(CenterSwitchError);
    // center.switch drives a swap, so it must not self-deadlock on the swapping guard.
    await expect(invoke('center.switch', { centreId: 'A' })).resolves.toEqual({
      ok: true,
      centreId: 'A',
    });
    // center.create (SOU-310) provisions then switches through the same path, so it
    // too must be exempt from the swapping guard and in-flight drain.
    await expect(
      invoke('center.create', { profile: { name: 'Annexe', address: '', phone: '', email: '' } }),
    ).resolves.toEqual({ ok: true, centreId: 'A', centerCode: 'CS-A' });

    inFlight.resolve([]);
    await outstanding;
    await swap;
    expect(runtime.currentCentreId).toBe('B');
  });

  it('(c) rejects a second overlapping swap while one is draining', async () => {
    const inFlight = createDeferred<unknown[]>();
    const { runtime, invoke } = recordingRuntime(
      fakeContainer('A', { listStudents: () => inFlight.promise }),
    );

    const outstanding = invoke('student.list', { search: '' });
    const first = runtime.swapTo(() => fakeContainer('B'));

    await expect(runtime.swapTo(() => fakeContainer('C'))).rejects.toBeInstanceOf(CenterSwitchError);

    inFlight.resolve([]);
    await outstanding;
    await first;
    expect(runtime.currentCentreId).toBe('B');
  });

  it('runs the sender guard before dispatch and blocks the handler when it rejects (SOU-236)', async () => {
    const listStudents = vi.fn(() => Promise.resolve([]));
    const trustedEvent = { tag: 'trusted' };
    const guard: IpcSenderGuard = vi.fn((event) => {
      if (event !== trustedEvent) throw new Error('untrusted sender');
    }) as unknown as IpcSenderGuard;

    const registry = new Map<string, (event: unknown, request: unknown) => unknown>();
    const ipcMain = {
      handle(channel: string, listener: (event: unknown, request: unknown) => unknown) {
        registry.set(channel, listener);
      },
    } as Pick<IpcMain, 'handle'>;
    new MainRuntime(ipcMain, fakeContainer('A', { listStudents }), guard);
    const listener = registry.get('student.list')!;

    // An untrusted event is rejected by the guard before the handler runs.
    await expect(Promise.resolve(listener({ tag: 'evil' }, { search: '' }))).rejects.toThrow(
      'untrusted sender',
    );
    expect(guard).toHaveBeenCalledWith({ tag: 'evil' });
    expect(listStudents).not.toHaveBeenCalled();

    // A trusted event passes the guard and reaches the dispatcher.
    await expect(Promise.resolve(listener(trustedEvent, { search: '' }))).resolves.toBeDefined();
    expect(listStudents).toHaveBeenCalledTimes(1);
  });

  it('(d) refuses the swap when an in-flight call does not settle within the drain window', async () => {
    vi.useFakeTimers();
    try {
      const neverSettles = createDeferred<unknown[]>();
      let aDisposed = false;
      const { runtime, invoke } = recordingRuntime(
        fakeContainer('A', {
          listStudents: () => neverSettles.promise,
          onDispose: () => (aDisposed = true),
        }),
      );

      void invoke('student.list', { search: '' });
      const swap = runtime.swapTo(() => fakeContainer('B')).catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(DRAIN_TIMEOUT_MS);

      expect(await swap).toBeInstanceOf(CenterSwitchError);
      expect(aDisposed).toBe(false);
      expect(runtime.currentCentreId).toBe('A');
    } finally {
      vi.useRealTimers();
    }
  });
});
