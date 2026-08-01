import { describe, it, expect, beforeEach } from 'vitest';
import { CreateBackup } from '../../../src/use-cases/create-backup';
import type { CenterCode } from '../../../src/value-objects/ids';
import { InMemoryBackupPort } from '../fakes/in-memory-backup-port';

const CENTER = 'CS-CASA-001' as CenterCode;

describe('CreateBackup', () => {
  let backups: InMemoryBackupPort;
  let useCase: CreateBackup;

  beforeEach(() => {
    backups = new InMemoryBackupPort();
    useCase = new CreateBackup(backups);
  });

  describe('happy path', () => {
    it('snapshots the live database to the chosen folder', async () => {
      const file = await useCase.execute({ destDir: '/Volumes/USB', centerCode: CENTER });

      expect(file.path.startsWith('/Volumes/USB/')).toBe(true);
      expect(backups.all()).toHaveLength(1);
    });

    it('trims the destination folder path', async () => {
      const file = await useCase.execute({ destDir: '  /Volumes/USB  ', centerCode: CENTER });
      expect(file.path.startsWith('/Volumes/USB/')).toBe(true);
    });
  });

  describe('validation', () => {
    it('rejects a blank destination folder', async () => {
      await expect(useCase.execute({ destDir: '   ', centerCode: CENTER })).rejects.toThrow();
      expect(backups.all()).toHaveLength(0);
    });
  });
});
