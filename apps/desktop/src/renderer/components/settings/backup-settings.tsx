import { BackupConfigCard } from './backup-config-card';
import { RestoreBackupCard } from './restore-backup-card';
import { ExcelBackupCard } from './excel-backup-card';

/**
 * Backup tab of the Settings page (SOU-102 + SOU-44): manual/scheduled backup
 * configuration, byte-level restore, then the Excel full-data export/import
 * card. Each card owns its own load lifecycle and file-pick flow.
 */
export function BackupSettings() {
  return (
    <section className="flex w-full flex-col gap-4">
      <BackupConfigCard />
      <RestoreBackupCard />
      <ExcelBackupCard />
    </section>
  );
}
