import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IpcMain } from 'electron';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CenterCode, PlanId, SubjectId } from '@centresoutien/domain';
import { buildContainer, type Container } from '../../src/main/composition-root';
import { MainRuntime } from '../../src/main/main-runtime';
import type { IpcChannel, IpcRequest, IpcResponse } from '../../src/shared/ipc/contract';

/**
 * SOU-186 — the demo/center hot-swap seam. `MainRuntime` registers every IPC
 * channel once and reroutes them to whichever container is open, so a demo
 * toggle closes the current SQLCipher handle and opens the target IN-PROCESS —
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

describe('MainRuntime demo/center hot-swap', () => {
  it('reroutes IPC to the swapped center and closes the previous DB handle without a restart', async () => {
    const real = openCenter('C1', 'CS-CASA-001', 'essentiel');
    const { ipcMain, invoke } = recordingIpcMain();
    const runtime = new MainRuntime(ipcMain, real);

    // A subject created in the real center is scoped to its DB + centerCode.
    await invoke('subject.create', { name: { fr: 'Maths', ar: 'الرياضيات' } });
    expect((await invoke('plan.get', {})).planId).toBe('essentiel');
    expect(real.db.open).toBe(true);

    const demo = openCenter('C2', 'CS-DEMO-001', 'premium');
    await runtime.swapTo(() => demo);

    // The previous handle is closed cleanly — the whole point of SOU-186 is that
    // this happens WITHOUT tearing the OS process down.
    expect(real.db.open).toBe(false);
    expect(demo.db.open).toBe(true);
    // Routing followed the swap: the plan is now the demo center's, and the demo
    // center is a distinct DB + centerCode, so the real center's subject is not
    // visible here (the bare-db-swap bug this design avoids).
    expect((await invoke('plan.get', {})).planId).toBe('premium');
    expect((await invoke('subject.list', { scope: 'all' })).subjects).toHaveLength(0);

    runtime.dispose();
    expect(demo.db.open).toBe(false);
  });

  it('routes a write to the swapped center, isolated from the previous one', async () => {
    const real = openCenter('C1', 'CS-CASA-001', 'premium');
    const { ipcMain, invoke } = recordingIpcMain();
    const runtime = new MainRuntime(ipcMain, real);

    const demo = openCenter('C2', 'CS-DEMO-001', 'premium');
    await runtime.swapTo(() => demo); // disposes the real container
    const { id } = await invoke('subject.create', { name: { fr: 'Physique', ar: 'الفيزياء' } });

    // The write landed in the demo center only.
    const listed = (await invoke('subject.list', { scope: 'all' })).subjects;
    expect(listed.map((s) => s.id)).toContain(id as SubjectId);

    runtime.dispose();

    // The real center never received it — reopen its DB fresh and confirm empty.
    const reopened = recordingIpcMain();
    const runtime2 = new MainRuntime(reopened.ipcMain, openCenter('C1', 'CS-CASA-001', 'premium'));
    expect((await reopened.invoke('subject.list', { scope: 'all' })).subjects).toHaveLength(0);
    runtime2.dispose();
  });

  it('keeps the current center live when the swap fails — no crash', async () => {
    const real = openCenter('C1', 'CS-CASA-001', 'essentiel');
    const { ipcMain, invoke } = recordingIpcMain();
    const runtime = new MainRuntime(ipcMain, real);

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
