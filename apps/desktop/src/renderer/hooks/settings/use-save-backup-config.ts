import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BackupConfigInput } from '@centresoutien/domain';
import { backupConfigQueryKey } from './use-backup-config';

/**
 * Saves the backup destination folder and retention count over the typed IPC
 * bridge (SOU-102). On success the config query is invalidated so the tab
 * reflects the canonical row.
 */
export function useSaveBackupConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BackupConfigInput) => window.api.invoke('backup.config.set', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: backupConfigQueryKey }),
  });
}
