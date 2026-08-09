import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CenterCode } from '@centresoutien/domain';
import { buildContainer, type Container } from '../../src/main/composition-root';
import { CenterHost } from '../../src/main/center/center-host';
import { FsCenterDirectory } from '../../src/data/sqlite/center-directory';
import { createIpcDispatcher } from '../../src/main/ipc/dispatcher';
import { createHandlers } from '../../src/main/ipc/handlers';
import type { CenterChangedEvent } from '../../src/shared/ipc/center-events';

const KEY = 'passphrase-under-test';
const CODES: Record<string, CenterCode> = {
  A: 'CS-CASA-001' as CenterCode,
  B: 'CS-RABAT-002' as CenterCode,
};

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-switch-'));
});
afterEach(() => {
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

describe('center switcher hot-swap (SOU-96)', () => {
  it('switches between two centers with full data isolation, closing the old handle', async () => {
    const emitted: CenterChangedEvent[] = [];
    // The switcher closures reference the host, which can only be built after the
    // initial container — a mutable holder breaks the cycle (mirrors index.ts's
    // late-bound `host` ref) without an assigned-once `let`.
    const holder: { current: CenterHost | null } = { current: null };

    const centerSwitch = {
      switchTo: (centreId: string): Promise<void> =>
        holder.current
          ? holder.current.swapTo(centreId)
          : Promise.reject(new Error('host not ready')),
      listCenters: () =>
        Promise.resolve(
          new FsCenterDirectory(dir, () => KEY).list(holder.current?.currentCentreId ?? 'A'),
        ),
    };
    const buildFor = (centreId: string): Container =>
      buildContainer({
        centreId,
        centerCode: CODES[centreId]!,
        key: KEY,
        dir,
        planId: 'premium', // org.multi-center is Premium-only
        appVersion: () => '2.0.0',
        scheduleRestart: () => {},
        centerSwitch,
      });

    const initial = buildFor('A');
    const host = new CenterHost({
      initial,
      initialCentreId: 'A',
      buildForCenter: buildFor,
      emitCenterChanged: (event) => emitted.push(event),
    });
    holder.current = host;
    const dispatch = createIpcDispatcher(host.ipcHandlers());

    // Center A: a saved profile + one student.
    await dispatch('center.save', {
      name: 'Centre A',
      address: '',
      phone: '',
      email: '',
      logoPath: null,
    });
    const { id: aStudent } = await dispatch('student.create', studentPayload('Yassine A'));
    expect((await dispatch('student.list', { search: '' })).students).toHaveLength(1);
    expect(await dispatch('center.current', {})).toEqual({
      centreId: 'A',
      centerCode: 'CS-CASA-001',
      displayName: 'Centre A',
    });

    // Switch to B: the swap closes A's handle and pushes a center.changed event.
    expect(await dispatch('center.switch', { centreId: 'B' })).toEqual({ ok: true, centreId: 'B' });
    expect(initial.db.open).toBe(false);
    expect(emitted).toEqual([
      { centreId: 'B', centerCode: 'CS-RABAT-002', displayName: 'CS-RABAT-002' },
    ]);

    // B is a different tenant file — none of A's rows are visible.
    expect((await dispatch('student.list', { search: '' })).students).toEqual([]);
    await dispatch('center.save', {
      name: 'Centre B',
      address: '',
      phone: '',
      email: '',
      logoPath: null,
    });
    const { id: bStudent } = await dispatch('student.create', studentPayload('Salma B'));
    expect((await dispatch('center.current', {})).displayName).toBe('Centre B');

    // Both centers now show up in the list, anchored on the active one.
    const listed = await dispatch('center.list', {});
    expect(listed.centers).toEqual([
      { centreId: 'A', centerCode: 'CS-CASA-001', displayName: 'Centre A', isActive: false },
      { centreId: 'B', centerCode: 'CS-RABAT-002', displayName: 'Centre B', isActive: true },
    ]);

    // Switch back to A: A's student persisted, B's never leaks across.
    expect(await dispatch('center.switch', { centreId: 'A' })).toEqual({ ok: true, centreId: 'A' });
    const backA = await dispatch('student.list', { search: '' });
    expect(backA.students.map((s) => s.id)).toEqual([aStudent]);
    expect(backA.students.map((s) => s.id)).not.toContain(bStudent);

    host.currentContainer.dispose();
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
