import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2 } from 'lucide-react';
import { Button, LockOverlay, toast } from '@centresoutien/ui';
import { selectFile } from '../../lib/settings/dialog';
import { useExcelBackupExport } from '../../hooks/settings/use-excel-backup-export';
import { ExcelExportSummary } from './excel-export-summary';

const XLSX_EXTENSIONS = ['xlsx'] as const;

/**
 * Export half of the Excel backup card (SOU-44): pick a destination `.xlsx`
 * file, write the whole center dataset, then show the per-sheet row counts.
 * The file picker returns a path (null when cancelled) — `centerCode` is never
 * sent from the renderer.
 */
export function ExcelBackupExportSection({ locked }: { locked: boolean }) {
  const { t } = useTranslation();
  const exportMutation = useExcelBackupExport();
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const onExport = async () => {
    const path = await selectFile(XLSX_EXTENSIONS);
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
