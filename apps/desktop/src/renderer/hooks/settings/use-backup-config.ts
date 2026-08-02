import { useQuery } from '@tanstack/react-query';

export const backupConfigQueryKey = ['settings', 'backup', 'config'] as const;

/**
 * Loads the backup destination/retention/last-run config over the typed IPC
 * bridge (SOU-102). `destinationDir` is `null` until the admin configures
 * one — no scheduled run happens until then (see `RunScheduledBackup`).
 */
export function useBackupConfig() {
  return useQuery({
    queryKey: backupConfigQueryKey,
    queryFn: () => window.api.invoke('backup.config.get', {}),
    refetchOnWindowFocus: false,
  });
}
