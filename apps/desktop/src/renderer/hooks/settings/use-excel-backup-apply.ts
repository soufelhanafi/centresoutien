import { useMutation } from '@tanstack/react-query';

/**
 * Commits an Excel backup file's created/updated rows in one transaction
 * (SOU-44). Duplicates and invalid rows are skipped — the response reports the
 * counts so the UI can state exactly what was written. Only called after the
 * dry-run preview has been shown and the human confirms.
 */
export function useExcelBackupApply() {
  return useMutation({
    mutationFn: (input: { filePath: string }) => window.api.invoke('backup.excel.apply', input),
  });
}
