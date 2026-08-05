import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2 } from 'lucide-react';
import { Button, LockOverlay, toast } from '@centresoutien/ui';
import { selectSaveFile } from '../../lib/settings/dialog';
import { useExcelBackupExport } from '../../hooks/settings/use-excel-backup-export';
import { ExcelExportSummary } from './excel-export-summary';

const XLSX_EXTENSIONS = ['xlsx'] as const;

/** Local date (`YYYY-MM-DD`) for the default backup file name. */
function backupDateStamp(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Export half of the Excel backup card (SOU-44): a native Save-As dialog picks
 * the destination `.xlsx` (default name `centresoutien-sauvegarde-<date>.xlsx`),
 * the whole center dataset is written, then the per-sheet row counts are shown.
 * `centerCode` is never sent from the renderer.
 */
export function ExcelBackupExportSection({ locked }: { locked: boolean }) {
  const { t } = useTranslation();
  const exportMutation = useExcelBackupExport();
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const onExport = async () => {
    const path = await selectSaveFile(`centresoutien-sauvegarde-${backupDateStamp()}.xlsx`, XLSX_EXTENSIONS);
    if (!path) return;
    setSavedPath(path);
    try {
      const result = await exportMutation.mutateAsync({ filePath: path });
      setSavedPath(result.filePath);
      toast.success(t('settings.backup.excel.exportSuccess'));
    } catch {
      toast.error(t('settings.backup.excel.exportError'));
    }
  };

  const content = (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">{t('settings.backup.excel.exportTitle')}</h3>
      <p className="text-sm text-muted-foreground">{t('settings.backup.excel.exportSubtitle')}</p>

      <div className="flex flex-col items-start gap-3">
        <Button type="button" variant="outline" onClick={onExport} disabled={exportMutation.isPending}>
          {exportMutation.isPending ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Download className="size-4" aria-hidden="true" />
          )}
          {exportMutation.isPending
            ? t('settings.backup.excel.exportPending')
            : t('settings.backup.excel.exportButton')}
        </Button>

        {savedPath && (
          <p dir="ltr" className="break-all text-sm text-muted-foreground">
            {t('settings.backup.excel.exportSavedTo', { path: savedPath })}
          </p>
        )}

        {exportMutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {t('settings.backup.excel.exportError')}
          </p>
        )}

        {exportMutation.isSuccess && exportMutation.data && (
          <ExcelExportSummary counts={exportMutation.data.counts} />
        )}
      </div>
    </section>
  );

  return locked ? (
    <LockOverlay
      title={t('settings.backup.excel.exportTitle')}
      description={t('plan.locked')}
      ctaLabel={t('plan.viewPlans')}
    >
      {content}
    </LockOverlay>
  ) : (
    content
  );
}
