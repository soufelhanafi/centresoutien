import { useMutation } from '@tanstack/react-query';

/**
 * Writes the full center dataset to an Excel workbook at `filePath` over the
 * typed IPC bridge (SOU-44). The path comes from the renderer's file picker;
 * `centerCode` is injected in main. Resolves with the written path and the
 * per-sheet row counts shown in the success summary.
 */
export function useExcelBackupExport() {
  return useMutation({
    mutationFn: (input: { filePath: string }) => window.api.invoke('backup.excel.export', input),
  });
}
