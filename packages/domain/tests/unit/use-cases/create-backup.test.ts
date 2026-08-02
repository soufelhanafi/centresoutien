import { describe, it, expect, beforeEach } from 'vitest';
import { CreateBackup } from '../../../src/use-cases/create-backup';
import type { CenterCode } from '../../../src/value-objects/ids';
import { InMemoryBackupPort } from '../fakes/in-memory-backup-port';
import { InMemoryBackupConfigStore } from '../fakes/in-memory-backup-config-store';

const CENTER = 'CS-CASA-001' as CenterCode;

describe('CreateBackup', () => {
  let backups: InMemoryBackupPort;
  let config: InMemoryBackupConfigStore;
  let useCase: CreateBackup;

  beforeEach(() => {
    backups = new InMemoryBackupPort();
    config = new InMemoryBackupConfigStore();
    useCase = new CreateBackup(backups, config);
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

  describe('retention pruning', () => {
    it('prunes to the configured retention count when the destination matches the configured folder', async () => {
      const DEST = '/Users/admin/CentreSoutienBackups';
      config.seed({ destinationDir: DEST, retentionCount: 2 });

      await useCase.execute({ destDir: DEST, centerCode: CENTER });
      await useCase.execute({ destDir: DEST, centerCode: CENTER });
      await useCase.execute({ destDir: DEST, centerCode: CENTER });
      await useCase.execute({ destDir: DEST, centerCode: CENTER });

      const remaining = await backups.list({ destDir: DEST, centerCode: CENTER });
      expect(remaining).toHaveLength(2);
    });

    it('leaves an arbitrary, unconfigured folder untouched', async () => {
      config.seed({ destinationDir: '/Users/admin/CentreSoutienBackups', retentionCount: 1 });

      await useCase.execute({ destDir: '/Volumes/USB', centerCode: CENTER });
      await useCase.execute({ destDir: '/Volumes/USB', centerCode: CENTER });

      const remaining = await backups.list({ destDir: '/Volumes/USB', centerCode: CENTER });
      expect(remaining).toHaveLength(2);
    });

    it('does not prune when no destination is configured yet', async () => {
      await useCase.execute({ destDir: '/Volumes/USB', centerCode: CENTER });
      await useCase.execute({ destDir: '/Volumes/USB', centerCode: CENTER });

      const remaining = await backups.list({ destDir: '/Volumes/USB', centerCode: CENTER });
      expect(remaining).toHaveLength(2);
    });
  });
});
