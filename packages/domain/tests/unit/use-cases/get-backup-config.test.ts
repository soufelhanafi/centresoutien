import { describe, it, expect } from 'vitest';
import { GetBackupConfig } from '../../../src/use-cases/get-backup-config';
import { DEFAULT_BACKUP_RETENTION_COUNT } from '../../../src/ports/backup-config-store';
import { InMemoryBackupConfigStore } from '../fakes/in-memory-backup-config-store';

describe('GetBackupConfig', () => {
  it('returns the default retention and no destination for a fresh center', async () => {
    const useCase = new GetBackupConfig(new InMemoryBackupConfigStore());
    expect(await useCase.execute()).toEqual({
      destinationDir: null,
      retentionCount: DEFAULT_BACKUP_RETENTION_COUNT,
      lastBackupAt: null,
    });
  });

  it('returns the saved configuration', async () => {
    const config = new InMemoryBackupConfigStore();
    config.seed({ destinationDir: '/Volumes/USB', retentionCount: 14 });
    const useCase = new GetBackupConfig(config);

    expect(await useCase.execute()).toMatchObject({
      destinationDir: '/Volumes/USB',
      retentionCount: 14,
    });
  });
});
