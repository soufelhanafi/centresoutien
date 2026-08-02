import type { BackupPort } from '../ports/backup-port';
import type { CenterCode } from '../value-objects/ids';

/**
 * Deletes everything past the newest `retentionCount` files for this center in
 * `destDir` — shared by {@link CreateBackup} and {@link RunScheduledBackup} so
 * "keep only the N newest" has exactly one implementation. `list` is
 * newest-first, so `slice(retentionCount)` is always the stale tail.
 */
export async function pruneBackupsToRetention(
  backups: BackupPort,
  destDir: string,
  centerCode: CenterCode,
  retentionCount: number,
): Promise<void> {
  const files = await backups.list({ destDir, centerCode });
  for (const stale of files.slice(retentionCount)) {
    await backups.remove(stale.path);
  }
}
