import { describe, it, expect, beforeEach } from 'vitest';
import { RunScheduledBackup } from '../../../src/use-cases/run-scheduled-backup';
import type { CenterCode } from '../../../src/value-objects/ids';
import { InMemoryBackupPort } from '../fakes/in-memory-backup-port';
import { InMemoryBackupConfigStore } from '../fakes/in-memory-backup-config-store';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEST = '/Users/admin/CentreSoutienBackups';

describe('RunScheduledBackup', () => {
  let backups: InMemoryBackupPort;
  let config: InMemoryBackupConfigStore;
  let clock: ReturnType<typeof fakeClock>;
  let useCase: RunScheduledBackup;

  beforeEach(() => {
    backups = new InMemoryBackupPort();
    config = new InMemoryBackupConfigStore();
    clock = fakeClock('2026-07-29T10:00:00Z');
    useCase = new RunScheduledBackup(backups, config, clock);
  });

  describe('not configured yet', () => {
    it('no-ops when no destination folder has been chosen', async () => {
      await useCase.execute({ centerCode: CENTER });
      expect(backups.all()).toHaveLength(0);
    });
  });

  describe('due check', () => {
    it('runs when no backup has ever been recorded', async () => {
      config.seed({ destinationDir: DEST, retentionCount: 7 });
      await useCase.execute({ centerCode: CENTER });
      expect(backups.all()).toHaveLength(1);
      expect((await config.get()).lastBackupAt).toEqual(new Date('2026-07-29T10:00:00Z'));
    });

    it('skips when the last run was under 24h ago', async () => {
      config.seed({ destinationDir: DEST, retentionCount: 7, lastBackupAt: new Date('2026-07-29T00:00:00Z') });
      await useCase.execute({ centerCode: CENTER });
      expect(backups.all()).toHaveLength(0);
    });

    it('runs when the last run was over 24h ago', async () => {
      config.seed({ destinationDir: DEST, retentionCount: 7, lastBackupAt: new Date('2026-07-27T00:00:00Z') });
      await useCase.execute({ centerCode: CENTER });
      expect(backups.all()).toHaveLength(1);
    });
  });

  describe('retention pruning', () => {
    it('keeps only the newest `retentionCount` files in the destination folder', async () => {
      config.seed({ destinationDir: DEST, retentionCount: 2 });
      // Two backups already sitting in the folder from prior runs.
      await backups.create({ destDir: DEST, centerCode: CENTER });
      await backups.create({ destDir: DEST, centerCode: CENTER });

      await useCase.execute({ centerCode: CENTER });

      const remaining = await backups.list({ destDir: DEST, centerCode: CENTER });
      expect(remaining).toHaveLength(2);
      expect(backups.removedPaths).toHaveLength(1);
    });

    it('never prunes another center’s backups in the same shared folder', async () => {
      const OTHER = 'CS-RABAT-002' as CenterCode;
      config.seed({ destinationDir: DEST, retentionCount: 1 });
      await backups.create({ destDir: DEST, centerCode: OTHER });
      await backups.create({ destDir: DEST, centerCode: OTHER });

      await useCase.execute({ centerCode: CENTER });

      const otherFiles = await backups.list({ destDir: DEST, centerCode: OTHER });
      expect(otherFiles).toHaveLength(2);
    });
  });
});
