import { useMutation } from '@tanstack/react-query';

/**
 * Dry-runs an Excel backup file without writing anything (SOU-44): reads the
 * workbook, classifies every row as created / updated / duplicate / invalid,
 * and returns the per-row report the import panel renders before apply.
 * `centerCode` is injected in main; the path comes from the file picker.
 */
export function useExcelBackupPreview() {
  return useMutation({
    mutationFn: (input: { filePath: string }) => window.api.invoke('backup.excel.preview', input),
  });
}
