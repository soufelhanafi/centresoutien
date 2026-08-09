import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, LockOverlay } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useUpgradeCta } from '../../hooks/use-upgrade-prompt';
import { ExcelBackupExportSection } from './excel-backup-export-section';
import { ExcelBackupImportSection } from './excel-backup-import-section';

/**
 * Excel backup/restore card (SOU-44): the portable full-data export/import
 * surface, distinct from the byte-level SOU-102 snapshot/restore above it.
 * Export and import are gated independently (`io.excel.export` / `io.excel.import`,
 * Pro+). On Essentiel both are locked and the whole card gets the standard lock
 * treatment; when only one half is gated, that half alone is locked.
 */
export function ExcelBackupCard() {
  const { t } = useTranslation();
  const canExport = useFeature('io.excel.export');
  const canImport = useFeature('io.excel.import');
  const allLocked = !canExport && !canImport;
  const upgradeCta = useUpgradeCta('io.excel.export');

  const body = (
    <div className="flex flex-col gap-6">
      <ExcelBackupExportSection locked={!canExport && !allLocked} />
      <ExcelBackupImportSection locked={!canImport && !allLocked} />
    </div>
  );

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t('settings.backup.excel.title')}</CardTitle>
        <CardDescription>{t('settings.backup.excel.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        {allLocked ? (
          <LockOverlay
            title={t('settings.backup.excel.title')}
            description={t('plan.locked')}
            ctaLabel={upgradeCta.ctaLabel}
            onCta={upgradeCta.onCta}
          >
            {body}
          </LockOverlay>
        ) : (
          body
        )}
      </CardContent>
    </Card>
  );
}
