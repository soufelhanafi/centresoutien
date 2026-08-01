import type { BackupPort, BackupFileInfo } from '../ports/backup-port';
import { createBackupInputSchema } from '../schemas/backup';
import type { CenterCode } from '../value-objects/ids';

export type CreateBackupInput = {
  destDir: string;
  centerCode: CenterCode;
};

/**
 * Manual backup export (SOU-102): snapshots the currently-open, encrypted
 * center database to a folder the admin picked — a local folder or a mounted
 * USB drive, "any folder the user picks". Delegates the WAL-checkpoint +
 * encrypted byte copy to the {@link BackupPort} adapter. Does not prune old
 * files — retention only applies to the configured scheduled destination (see
 * `RunScheduledBackup`), so a one-off manual export to an arbitrary folder
 * never deletes files the admin didn't ask about. No plan gate: backup ships
 * in every plan.
 */
export class CreateBackup {
  constructor(private readonly backups: BackupPort) {}

  async execute(input: CreateBackupInput): Promise<BackupFileInfo> {
    const { destDir } = createBackupInputSchema.parse({ destDir: input.destDir });
    return this.backups.create({ destDir, centerCode: input.centerCode });
  }
}
