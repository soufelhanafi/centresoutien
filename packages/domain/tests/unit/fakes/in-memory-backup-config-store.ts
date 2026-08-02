import type { BackupConfigStore, BackupConfig } from '../../../src/ports/backup-config-store';
import { DEFAULT_BACKUP_RETENTION_COUNT } from '../../../src/ports/backup-config-store';

export class InMemoryBackupConfigStore implements BackupConfigStore {
  private state: BackupConfig = {
    destinationDir: null,
    retentionCount: DEFAULT_BACKUP_RETENTION_COUNT,
    lastBackupAt: null,
  };

  async get(): Promise<BackupConfig> {
    return { ...this.state };
  }

  async save(input: { destinationDir: string; retentionCount: number }): Promise<void> {
    this.state = { ...this.state, ...input };
  }

  async recordBackupRun(at: Date): Promise<void> {
    this.state = { ...this.state, lastBackupAt: at };
  }

  // test-only helper
  seed(partial: Partial<BackupConfig>): void {
    this.state = { ...this.state, ...partial };
  }
}
