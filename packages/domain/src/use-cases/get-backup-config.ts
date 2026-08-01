import type { BackupConfigStore, BackupConfig } from '../ports/backup-config-store';

/** Reads the backup destination/retention/last-run state (SOU-102). No plan
 *  gate: backup ships in every plan. */
export class GetBackupConfig {
  constructor(private readonly config: BackupConfigStore) {}

  async execute(): Promise<BackupConfig> {
    return this.config.get();
  }
}
