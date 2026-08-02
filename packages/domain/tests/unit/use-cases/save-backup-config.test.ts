import { describe, it, expect, beforeEach } from 'vitest';
import { SaveBackupConfig } from '../../../src/use-cases/save-backup-config';
import { InMemoryBackupConfigStore } from '../fakes/in-memory-backup-config-store';

describe('SaveBackupConfig', () => {
  let config: InMemoryBackupConfigStore;
  let useCase: SaveBackupConfig;

  beforeEach(() => {
    config = new InMemoryBackupConfigStore();
    useCase = new SaveBackupConfig(config);
  });

  describe('happy path', () => {
    it('saves the destination folder and retention count', async () => {
      const result = await useCase.execute({ destinationDir: '/Volumes/USB', retentionCount: 10 });

      expect(result).toMatchObject({ destinationDir: '/Volumes/USB', retentionCount: 10 });
      expect(await config.get()).toMatchObject({ destinationDir: '/Volumes/USB', retentionCount: 10 });
    });
  });

  describe('validation', () => {
    it('rejects a blank destination folder and persists nothing', async () => {
      await expect(useCase.execute({ destinationDir: '  ', retentionCount: 7 })).rejects.toThrow();
      expect((await config.get()).destinationDir).toBeNull();
    });

    it('rejects a retention count below 1', async () => {
      await expect(
        useCase.execute({ destinationDir: '/Volumes/USB', retentionCount: 0 }),
      ).rejects.toThrow();
    });

    it('rejects a retention count above 30', async () => {
      await expect(
        useCase.execute({ destinationDir: '/Volumes/USB', retentionCount: 31 }),
      ).rejects.toThrow();
    });

    it('rejects a non-integer retention count', async () => {
      await expect(
        useCase.execute({ destinationDir: '/Volumes/USB', retentionCount: 7.5 }),
      ).rejects.toThrow();
    });
  });
});
