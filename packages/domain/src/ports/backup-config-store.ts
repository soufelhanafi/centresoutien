/** Default retention (SOU-102 KICKOFF: not specified in the ticket, defaulting
 *  to 7 daily copies) — exposed so the UI reads it instead of hardcoding it. */
export const DEFAULT_BACKUP_RETENTION_COUNT = 7;

export type BackupConfig = {
  /** Folder backups are written to — local path or a mounted USB drive.
   *  `null` until the admin configures it (no auto-scheduled run happens). */
  destinationDir: string | null;
  retentionCount: number;
  /** When the scheduled backup last ran, for the launch-time ">24h" check. */
  lastBackupAt: Date | null;
};

/**
 * Port for the backup destination/retention/schedule state. Local device
 * config, not a synced entity (SOU-102 KICKOFF) — no envelope, no ULID. The
 * SQLite adapter persists it as plain keys in the per-center `app_meta` table,
 * per the KICKOFF decision to not add a new structured settings table.
 */
export interface BackupConfigStore {
  get(): Promise<BackupConfig>;
  save(input: { destinationDir: string; retentionCount: number }): Promise<void>;
  recordBackupRun(at: Date): Promise<void>;
}
