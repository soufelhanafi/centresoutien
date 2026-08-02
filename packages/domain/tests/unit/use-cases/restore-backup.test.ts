import { describe, it, expect, beforeEach } from 'vitest';
import { RestoreBackup } from '../../../src/use-cases/restore-backup';
import { InMemoryBackupPort } from '../fakes/in-memory-backup-port';

const KEY = 'correct-key';
const PATH = '/Volumes/USB/backup-CS-CASA-001_0001.db';

describe('RestoreBackup', () => {
  let backups: InMemoryBackupPort;
  let useCase: RestoreBackup;

  beforeEach(() => {
    backups = new InMemoryBackupPort();
    useCase = new RestoreBackup(backups);
  });

  describe('happy path', () => {
    it('restores once the backup verifies with the given key', async () => {
      backups.seedVerification(PATH, { ok: true });

      const result = await useCase.execute({ path: PATH, key: KEY });

      expect(result).toEqual({ outcome: 'restored' });
      expect(backups.restoredPaths).toEqual([PATH]);
    });
  });

  describe('unsafe backups never touch the live database', () => {
    it('reports wrong-key and never calls restore', async () => {
      backups.seedVerification(PATH, { ok: false, reason: 'wrong-key' });

      const result = await useCase.execute({ path: PATH, key: 'a-deliberately-different-key' });

      expect(result).toEqual({ outcome: 'wrong-key' });
      expect(backups.restoredPaths).toEqual([]);
    });

    it('reports corrupted and never calls restore', async () => {
      backups.seedVerification(PATH, { ok: false, reason: 'corrupted' });

      const result = await useCase.execute({ path: PATH, key: KEY });

      expect(result).toEqual({ outcome: 'corrupted' });
      expect(backups.restoredPaths).toEqual([]);
    });

    it('reports not-found for a missing/unpicked file and never calls restore', async () => {
      const result = await useCase.execute({ path: '/nowhere/missing.db', key: KEY });

      expect(result).toEqual({ outcome: 'not-found' });
      expect(backups.restoredPaths).toEqual([]);
    });
  });
});
