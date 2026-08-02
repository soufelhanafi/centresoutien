import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateBackupInputSchema } from '@centresoutien/domain';
import { backupConfigQueryKey } from './use-backup-config';

/**
 * Triggers an on-demand backup snapshot into `destDir` over the typed IPC
 * bridge (SOU-102). Invalidates the config query afterwards since a manual
 * backup does not itself update `lastBackupAt` (only the scheduled run does),
 * but a stale destination in the form should still re-sync from the source
 * of truth after a successful write.
 */
export function useCreateBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBackupInputSchema) => window.api.invoke('backup.create', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: backupConfigQueryKey }),
  });
}
