import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CenterCode } from '@centresoutien/domain';
import { buildContainer } from '../../src/main/composition-root';
import { createIpcDispatcher } from '../../src/main/ipc/dispatcher';
import { createHandlers } from '../../src/main/ipc/handlers';
import { FsCenterDirectory } from '../../src/data/sqlite/center-directory';

const KEY = 'passphrase-under-test';
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-dir-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function seedCenter(centreId: string, centerCode: CenterCode, name: string): Promise<void> {
  const container = buildContainer({
    centreId,
    centerCode,
    key: KEY,
    dir,
    planId: 'premium',
    appVersion: () => '2.0.0',
    scheduleRestart: () => {},
  });
  const dispatch = createIpcDispatcher(createHandlers(container.handlerDeps));
  await dispatch('center.save', { name, address: '', phone: '', email: '', logoPath: null });
  container.dispose();
}

describe('FsCenterDirectory (SOU-96)', () => {
  it('lists every centre-*.db by its own profile, marking the active center', async () => {
    await seedCenter('casa', 'CS-CASA-001' as CenterCode, 'Centre Al Ilm');
    await seedCenter('rabat', 'CS-RABAT-002' as CenterCode, 'Centre Annexe');

    const directory = new FsCenterDirectory(dir, () => KEY);
    const centers = directory.list('rabat');

    // Sorted by display name; each field comes from that center's own file.
    expect(centers).toEqual([
      { centreId: 'casa', centerCode: 'CS-CASA-001', displayName: 'Centre Al Ilm', isActive: false },
      { centreId: 'rabat', centerCode: 'CS-RABAT-002', displayName: 'Centre Annexe', isActive: true },
    ]);
  });

  it('peeks a single center tenant code + display name without merging files', async () => {
    await seedCenter('casa', 'CS-CASA-001' as CenterCode, 'Centre Al Ilm');
    const directory = new FsCenterDirectory(dir, () => KEY);
    expect(directory.peek('casa')).toEqual({
      centerCode: 'CS-CASA-001',
      displayName: 'Centre Al Ilm',
    });
    expect(directory.peek('ghost')).toBeNull();
  });

  it('excludes configured centres and ignores non-centre files', async () => {
    await seedCenter('casa', 'CS-CASA-001' as CenterCode, 'Centre Al Ilm');
    await seedCenter('archive', 'CS-ARCHIVE-000' as CenterCode, 'Archive');
    // Sidecars + unrelated files must never be mistaken for a center DB.
    writeFileSync(join(dir, 'centre-casa.db-wal'), 'x');
    writeFileSync(join(dir, 'hub-casa.db'), 'x');
    writeFileSync(join(dir, 'license-CS-CASA-001.json'), 'x');

    const directory = new FsCenterDirectory(dir, () => KEY, ['archive']);
    const centers = directory.list('casa');

    expect(centers.map((c) => c.centreId)).toEqual(['casa']);
  });

  it('falls back to the centreId when a center file cannot be opened with its key', async () => {
    // A file that is not a valid SQLCipher DB under KEY — discovery degrades to a
    // centreId-based summary rather than throwing and breaking the whole list.
    writeFileSync(join(dir, 'centre-corrupt.db'), 'not-a-database');
    const directory = new FsCenterDirectory(dir, () => KEY);
    expect(directory.list('other')).toEqual([
      { centreId: 'corrupt', centerCode: 'corrupt', displayName: 'corrupt', isActive: false },
    ]);
  });
});
