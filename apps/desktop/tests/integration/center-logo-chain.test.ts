import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CenterCode, PlanId } from '@centresoutien/domain';
import { buildContainer } from '../../src/main/composition-root';
import { createIpcDispatcher } from '../../src/main/ipc/dispatcher';
import { createHandlers } from '../../src/main/ipc/handlers';

const KEY = 'passphrase-under-test';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-center-logo-chain-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function build(planId: PlanId = 'essentiel') {
  return buildContainer({
    centreId: 'C1',
    centerCode: 'CS-CASA-001' as CenterCode,
    key: KEY,
    dir,
    tempDir: dir,
    planId,
    appVersion: () => '2.0.0',
    scheduleRestart: () => {},
  });
}

/**
 * Mimic renderer→main argument crossing: Electron's `ipcRenderer.invoke` /
 * `contextBridge` serializes arguments with the V8 structured-clone algorithm,
 * which the unit tests bypass by calling the dispatcher directly. Cloning here
 * keeps the `center.saveLogo` → `center.save` → `center.get` → `center.logoBytes`
 * chain honest about what arrives at `ipcMain.handle` (SOU-250).
 */
function throughIpc<T>(value: T): T {
  return structuredClone(value) as T;
}

/**
 * SOU-250 regression — the full write/persist/read/serve chain for the center
 * logo, end to end through the real dispatcher, FsLogoStore, and SQLite
 * repository. Uploading must write a file under app data, `center.save` must
 * persist its relative path, `center.get` must return it, and `center.logoBytes`
 * must serve back the exact bytes — so a "successful upload that never displays"
 * has no server-side seam left to hide in.
 */
describe('center logo full chain (SOU-250)', () => {
  it('writes → persists → returns → serves the same bytes', async () => {
    const container = build();
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));

    const originalBytes = new Uint8Array([137, 80, 78, 71, 10, 20, 30]);

    const saved = await dispatch(
      'center.saveLogo',
      throughIpc({ bytes: originalBytes, extension: 'png' }),
    );
    expect(saved.path).toMatch(/^logos\/lgo_[A-Z0-9]+\.png$/);

    const savedProfile = await dispatch(
      'center.save',
      throughIpc({
        name: 'Centre Test',
        address: 'Rue 1',
        phone: '0612345678',
        email: '',
        logoPath: saved.path,
      }),
    );
    expect(savedProfile.center.logoPath).toBe(saved.path);

    const profile = await dispatch('center.get', throughIpc({}));
    expect(profile.center?.logoPath).toBe(saved.path);

    const fetched = await dispatch('center.logoBytes', throughIpc({ path: saved.path }));
    expect(fetched.bytes).toBeInstanceOf(Uint8Array);
    expect(fetched.bytes).toEqual(originalBytes);
  });

  it('serves null bytes for a poisoned path instead of reading outside the logo dir', async () => {
    const container = build();
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));

    await expect(
      dispatch('center.logoBytes', throughIpc({ path: 'logos/../secret.txt' })),
    ).resolves.toEqual({ bytes: null });
  });
});
