import { useMutation } from '@tanstack/react-query';

/**
 * Restores the live center database from a backup file over the typed IPC
 * bridge (SOU-102). Never throws for a bad file — resolves with a
 * discriminated `outcome` (`restored | not-found | corrupted | wrong-key`)
 * that the caller switches on. On `'restored'` the main process schedules an
 * app relaunch a moment later; the caller must show a "restarting…" state and
 * stop issuing further IPC calls.
 */
export function useRestoreBackup() {
  return useMutation({
    mutationFn: (input: { path: string }) => window.api.invoke('backup.restore', input),
  });
}
