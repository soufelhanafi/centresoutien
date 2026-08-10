import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IpcMain } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CenterSwitchError, type CenterCode } from '@centresoutien/domain';
import { buildContainer, type Container } from '../../src/main/composition-root';
import { MainRuntime } from '../../src/main/main-runtime';
import { CenterHost } from '../../src/main/center/center-host';
import { FsCenterDirectory } from '../../src/data/sqlite/center-directory';
import { createIpcDispatcher } from '../../src/main/ipc/dispatcher';
import { createHandlers } from '../../src/main/ipc/handlers';
import type { IpcChannel, IpcRequest, IpcResponse } from '../../src/shared/ipc/contract';
import type { CenterChangedEvent } from '../../src/shared/ipc/center-events';

const KEY = 'passphrase-under-test';
const CODES: Record<string, CenterCode> = {
  A: 'CS-CASA-001' as CenterCode,
  B: 'CS-RABAT-002' as CenterCode,
};

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-switch-'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

function studentPayload(fr: string) {
  return {
    name: { fr, ar: fr },
    birthDate: '2010-01-01',
    level: '2 Bac SM',
    school: null,
    notes: null,
    guardianIds: [],
  };
}

/** A fake `ipcMain` recording the handler per channel so the test can invoke it —
 *  the same seam `MainRuntime` binds in the real main process. */
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

/**
 * Wires the real switcher exactly as `index.ts` does: one `MainRuntime` owning the
 * live container + `ipcMain`, and a `CenterHost` layering the installed-center
 * whitelist, short-circuit, and `center.changed` emit on top of `runtime.swapTo`.
 */
function wireSwitcher(emitted: CenterChangedEvent[]): {
  runtime: MainRuntime;
  host: CenterHost;
  invoke: <C extends IpcChannel>(channel: C, request: IpcRequest<C>) => Promise<IpcResponse<C>>;
} {
  const directory = new FsCenterDirectory(dir, () => KEY);
  // The switcher closures reference the runtime + host, which can only be built
  // after the initial container — mutable holders break the cycle (mirrors
  // index.ts's late-bound module refs) without an assigned-once `let`.
  const holder: { runtime: MainRuntime | null; host: CenterHost | null } = {
    runtime: null,
    host: null,
  };
  const currentCentreId = (): string => holder.runtime?.currentCentreId ?? 'A';
  const centerSwitch = {
    switchTo: (centreId: string): Promise<void> =>
      holder.host?.swapTo(centreId) ?? Promise.reject(new CenterSwitchError('host not ready')),
    listCenters: () => Promise.resolve(directory.list(currentCentreId())),
  };
  const buildFor = (centreId: string): Container =>
    buildContainer({
      centreId,
      centerCode: CODES[centreId] ?? (`CS-${centreId.toUpperCase()}` as CenterCode),
      key: KEY,
      dir,
      planId: 'premium', // org.multi-center is Premium-only
      appVersion: () => '2.0.0',
      scheduleRestart: () => {},
      centerSwitch,
    });

  // Provision B's DB file so it is an installed center the switcher can reach —
  // the whitelist only ever accepts an id that names a real `centre-*.db` on disk.
  buildFor('B').dispose();

  const recorded = recordingIpcMain();
  const runtime = new MainRuntime(recorded.ipcMain, buildFor('A'));
  holder.runtime = runtime;
  const host = new CenterHost({
    runtime,
    buildForCenter: buildFor,
    listInstalledCentreIds: () => directory.list(currentCentreId()).map((c) => c.centreId),
    emitCenterChanged: (event) => emitted.push(event),
  });
  holder.host = host;
  return { runtime, host, invoke: recorded.invoke };
}

describe('center switcher hot-swap (SOU-96)', () => {
  it('switches between two centers with full data isolation, closing the old handle', async () => {
    const emitted: CenterChangedEvent[] = [];
    const { runtime, invoke } = wireSwitcher(emitted);
    const initial = runtime.currentContainer;

    // Center A: a saved profile + one student.
    await invoke('center.save', {
      name: 'Centre A',
      address: '',
      phone: '',
      email: '',
      logoPath: null,
    });
    const { id: aStudent } = await invoke('student.create', studentPayload('Yassine A'));
    expect((await invoke('student.list', { search: '' })).students).toHaveLength(1);
    expect(await invoke('center.current', {})).toEqual({
      centreId: 'A',
      centerCode: 'CS-CASA-001',
      displayName: 'Centre A',
    });

    // Switch to B: the swap closes A's handle and pushes a center.changed event.
    expect(await invoke('center.switch', { centreId: 'B' })).toEqual({ ok: true, centreId: 'B' });
    expect(initial.db.open).toBe(false);
    expect(emitted).toEqual([
      { centreId: 'B', centerCode: 'CS-RABAT-002', displayName: 'CS-RABAT-002' },
    ]);

    // B is a different tenant file — none of A's rows are visible.
    expect((await invoke('student.list', { search: '' })).students).toEqual([]);
    await invoke('center.save', {
      name: 'Centre B',
      address: '',
      phone: '',
      email: '',
      logoPath: null,
    });
    const { id: bStudent } = await invoke('student.create', studentPayload('Salma B'));
    expect((await invoke('center.current', {})).displayName).toBe('Centre B');

    // Both centers now show up in the list, anchored on the active one.
    const listed = await invoke('center.list', {});
    expect(listed.centers).toEqual([
      { centreId: 'A', centerCode: 'CS-CASA-001', displayName: 'Centre A', isActive: false },
      { centreId: 'B', centerCode: 'CS-RABAT-002', displayName: 'Centre B', isActive: true },
    ]);

    // Switch back to A: A's student persisted, B's never leaks across.
    expect(await invoke('center.switch', { centreId: 'A' })).toEqual({ ok: true, centreId: 'A' });
    const backA = await invoke('student.list', { search: '' });
    expect(backA.students.map((s) => s.id)).toEqual([aStudent]);
    expect(backA.students.map((s) => s.id)).not.toContain(bStudent);

    runtime.dispose();
  });

  it('rejects a path-traversal center id without opening any DB (Greptile P1)', async () => {
    const emitted: CenterChangedEvent[] = [];
    const { runtime, host } = wireSwitcher(emitted);
    const initial = runtime.currentContainer;

    // The host whitelist runs before any `centre-{id}.db` path is built. A
    // traversal id (or a structurally valid but uninstalled one) is refused with
    // CenterSwitchError and never reaches a DB open.
    for (const evil of ['../../evil', 'foo/bar', '..\\..\\escape', 'ghost']) {
      await expect(host.swapTo(evil)).rejects.toBeInstanceOf(CenterSwitchError);
    }

    // No swap happened: A is still the live, open center and nothing was emitted.
    expect(runtime.currentCentreId).toBe('A');
    expect(initial.db.open).toBe(true);
    expect(emitted).toEqual([]);

    runtime.dispose();
  });

  it('enforces the org.multi-center plan gate server-side, never touching the DB on a locked plan', async () => {
    let reached = false;
    const essentiel = buildContainer({
      centreId: 'A',
      centerCode: CODES.A!,
      key: KEY,
      dir,
      planId: 'essentiel', // lacks org.multi-center
      appVersion: () => '2.0.0',
      scheduleRestart: () => {},
      centerSwitch: {
        switchTo: () => {
          reached = true;
          return Promise.resolve();
        },
        listCenters: () => Promise.resolve([]),
      },
    });
    const dispatch = createIpcDispatcher(createHandlers(essentiel.handlerDeps));

    await expect(dispatch('center.switch', { centreId: 'B' })).rejects.toThrow(/not available/);
    expect(reached).toBe(false);

    essentiel.dispose();
  });
});
