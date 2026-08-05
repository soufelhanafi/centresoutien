import { useMutation } from '@tanstack/react-query';

/**
 * Dry-runs an Excel backup file without writing anything (SOU-44): reads the
 * workbook, classifies every row as created / updated / duplicate / invalid,
 * and returns the per-row report the import panel renders before apply.
 * The source is a main-issued dialog token — never a raw renderer path;
 * `centerCode` is injected in main.
 */
export function useExcelBackupPreview() {
  return useMutation({
    mutationFn: (input: { pathToken: string }) => window.api.invoke('backup.excel.preview', input),
  });
}
