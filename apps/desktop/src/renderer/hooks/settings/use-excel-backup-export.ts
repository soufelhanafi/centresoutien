import { useMutation } from '@tanstack/react-query';

/**
 * Writes the full center dataset to an Excel workbook over the typed IPC bridge
 * (SOU-44). The destination is a main-issued dialog token — never a raw
 * renderer path; `centerCode` is injected in main. Resolves with the written
 * path and the per-sheet row counts shown in the success summary.
 */
export function useExcelBackupExport() {
  return useMutation({
    mutationFn: (input: { pathToken: string }) => window.api.invoke('backup.excel.export', input),
  });
}
