import type { BackupPort, BackupFileInfo } from '../ports/backup-port';
import type { BackupConfigStore } from '../ports/backup-config-store';
import { createBackupInputSchema } from '../schemas/backup';
import type { CenterCode } from '../value-objects/ids';
import { pruneBackupsToRetention } from './prune-backups-to-retention';

export type CreateBackupInput = {
  destDir: string;
  centerCode: CenterCode;
};

/**
 * Manual backup export (SOU-102): snapshots the currently-open, encrypted
 * center database to a folder the admin picked — a local folder or a mounted
 * USB drive, "any folder the user picks". Delegates the WAL-checkpoint +
 * encrypted byte copy to the {@link BackupPort} adapter.
 *
 * Prunes to the configured retention count only when `destDir` is the same
 * folder the admin configured for scheduled backups — the Settings UI shows
 * one destination + one retention count shared by "back up now" and the
 * scheduled job, so a user who set retention=2 and clicked "back up now"
 * four times expects only 2 files left, not 4. An export to a *different*,
 * arbitrary folder is left untouched, since retention was never configured
 * for that folder.
 */
export class CreateBackup {
  constructor(
    private readonly backups: BackupPort,
    private readonly config: BackupConfigStore,
  ) {}

  async execute(input: CreateBackupInput): Promise<BackupFileInfo> {
    const { destDir } = createBackupInputSchema.parse({ destDir: input.destDir });
    const file = await this.backups.create({ destDir, centerCode: input.centerCode });

    const cfg = await this.config.get();
    if (cfg.destinationDir === destDir) {
      await pruneBackupsToRetention(this.backups, destDir, input.centerCode, cfg.retentionCount);
    }

    return file;
  }
}
