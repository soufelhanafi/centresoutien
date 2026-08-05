import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileUp, Loader2 } from 'lucide-react';
import { Button, LockOverlay } from '@centresoutien/ui';
import { selectFile } from '../../lib/settings/dialog';
import { useExcelBackupPreview } from '../../hooks/settings/use-excel-backup-preview';
import { ExcelBackupPreview } from './excel-backup-preview';

const XLSX_EXTENSIONS = ['xlsx'] as const;

/**
 * Import half of the Excel backup card (SOU-44): pick a workbook, dry-run it,
 * then hand the report to `ExcelBackupPreview` which owns the apply step.
 * `centerCode` is injected in main; the renderer sends the dialog token, never
 * a raw path.
 */
export function ExcelBackupImportSection({ locked }: { locked: boolean }) {
  const { t } = useTranslation();
  const preview = useExcelBackupPreview();
  const [filePath, setFilePath] = useState<string | null>(null);
  const [pathToken, setPathToken] = useState<string | null>(null);

  const onPick = async () => {
    const picked = await selectFile(XLSX_EXTENSIONS);
    if (!picked.path || !picked.token) return;
    setFilePath(picked.path);
    setPathToken(picked.token);
    preview.reset();
    preview.mutate({ pathToken: picked.token });
  };

  const content = (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">{t('settings.backup.excel.importTitle')}</h3>
      <p className="text-sm text-muted-foreground">{t('settings.backup.excel.importSubtitle')}</p>

      <div className="flex flex-col items-start gap-3">
        <Button type="button" variant="outline" onClick={onPick} disabled={preview.isPending}>
          {preview.isPending ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <FileUp className="size-4" aria-hidden="true" />
          )}
          {preview.isPending
            ? t('settings.backup.excel.importPending')
            : t('settings.backup.excel.importButton')}
        </Button>

        {filePath && (
          <p dir="ltr" className="break-all text-sm text-muted-foreground">
            {filePath}
          </p>
        )}

        {preview.isError && (
          <p role="alert" className="text-sm text-destructive">
            {t('settings.backup.excel.importError')}
          </p>
        )}

        {preview.isSuccess && preview.data && filePath && pathToken && (
          <ExcelBackupPreview preview={preview.data.preview} pathToken={pathToken} onRepick={onPick} />
        )}
      </div>
    </section>
  );

  return locked ? (
    <LockOverlay
      title={t('settings.backup.excel.importTitle')}
      description={t('plan.locked')}
      ctaLabel={t('plan.viewPlans')}
    >
      {content}
    </LockOverlay>
  ) : (
    content
  );
}
