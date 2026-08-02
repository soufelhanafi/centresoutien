import type { Database as DB } from 'better-sqlite3';
import type { BackupConfigStore, BackupConfig } from '@centresoutien/domain';
import { DEFAULT_BACKUP_RETENTION_COUNT } from '@centresoutien/domain';

/** Plain keys in the local, non-synced `app_meta` table (SOU-102 KICKOFF: no
 *  dedicated settings table — mirrors how `device_origin` already lives there). */
const KEYS = {
  destinationDir: 'backup_destination_dir',
  retentionCount: 'backup_retention_count',
  lastBackupAt: 'backup_last_backup_at',
} as const;

export class SqliteBackupConfigStore implements BackupConfigStore {
  constructor(private readonly db: DB) {}

  async get(): Promise<BackupConfig> {
    const retentionRaw = this.read(KEYS.retentionCount);
    const lastBackupRaw = this.read(KEYS.lastBackupAt);
    return {
      destinationDir: this.read(KEYS.destinationDir),
      retentionCount: retentionRaw === null ? DEFAULT_BACKUP_RETENTION_COUNT : Number.parseInt(retentionRaw, 10),
      lastBackupAt: lastBackupRaw === null ? null : new Date(lastBackupRaw),
    };
  }

  async save(input: { destinationDir: string; retentionCount: number }): Promise<void> {
    this.write(KEYS.destinationDir, input.destinationDir);
    this.write(KEYS.retentionCount, String(input.retentionCount));
  }

  async recordBackupRun(at: Date): Promise<void> {
    this.write(KEYS.lastBackupAt, at.toISOString());
  }

  private read(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  private write(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO app_meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }
}
