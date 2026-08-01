import { BackupConfigCard } from './backup-config-card';
import { RestoreBackupCard } from './restore-backup-card';

/**
 * Backup tab of the Settings page (SOU-102): manual/scheduled backup
 * configuration, then the restore flow. Two independent cards — the config
 * card owns its own load lifecycle, the restore card has no server state to
 * load (it only picks a file and calls a mutation).
 */
export function BackupSettings() {
  return (
    <section className="flex w-full flex-col gap-4">
      <BackupConfigCard />
      <RestoreBackupCard />
    </section>
  );
}
