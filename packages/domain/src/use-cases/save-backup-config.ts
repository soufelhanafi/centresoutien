import type { BackupConfigStore, BackupConfig } from '../ports/backup-config-store';
import { backupConfigInputSchema } from '../schemas/backup';

export type SaveBackupConfigInput = {
  destinationDir: string;
  retentionCount: number;
};

/**
 * Saves the manual + scheduled backup destination folder and retention count
 * (SOU-102 KICKOFF: no dedicated settings table — both live as plain keys in
 * the per-center `app_meta` table via {@link BackupConfigStore}). No plan
 * gate: backup ships in every plan.
 */
export class SaveBackupConfig {
  constructor(private readonly config: BackupConfigStore) {}

  async execute(input: SaveBackupConfigInput): Promise<BackupConfig> {
    const parsed = backupConfigInputSchema.parse(input);
    await this.config.save(parsed);
    return this.config.get();
  }
}
