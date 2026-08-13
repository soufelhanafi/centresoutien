import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CenterCode, LicensePort } from '@centresoutien/domain';
import { buildContainer } from '../../src/main/composition-root';
import { createIpcDispatcher } from '../../src/main/ipc/dispatcher';
import { createHandlers } from '../../src/main/ipc/handlers';

const KEY = 'passphrase-under-test';
const MISSING_LICENSE: LicensePort = {
  verify: () => ({ status: 'missing' }),
  verifyContent: () => ({ status: 'invalid-signature' }),
};
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-trial-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('center trial access (SOU-246)', () => {
  it('starts at new-center setup and hard-locks normal IPC on day 15', async () => {
    const container = buildContainer({
      centreId: 'casa',
      centerCode: 'CS-CASA-001' as CenterCode,
      key: KEY,
      dir,
      tempDir: dir,
      planId: 'essentiel',
      appVersion: () => '2.0.0',
      scheduleRestart: () => {},
      license: MISSING_LICENSE,
    });
    const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps), {
      isRestricted: container.isRestricted,
      isSetupComplete: container.isSetupComplete,
    });

    expect(await dispatch('license.status', {})).toMatchObject({ status: 'missing', restricted: true, trial: null });

    await dispatch('center.save', { name: 'Centre Al Ilm', address: '', phone: '', email: '', logoPath: null });
    expect(await dispatch('license.status', {})).toMatchObject({ status: 'trial-active', restricted: false });

    container.db
      .prepare("UPDATE center_trial SET started_at = '2026-01-01T00:00:00.000Z', last_seen_at = '2026-01-15T00:00:00.000Z'")
      .run();
    expect(await dispatch('license.status', {})).toMatchObject({ status: 'trial-expired', restricted: true });
    await expect(dispatch('student.list', { search: '' })).rejects.toThrow(/license-restricted/);

    container.dispose();
  });
});
