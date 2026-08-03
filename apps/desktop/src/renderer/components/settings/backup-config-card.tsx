import { useTranslation } from 'react-i18next';
import { DatabaseBackup } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, ErrorState, Skeleton } from '@centresoutien/ui';
import { useBackupConfig } from '../../hooks/settings/use-backup-config';
import { BackupConfigForm } from './backup-config-form';

/**
 * Loads the backup destination/retention config (SOU-102) and owns the load
 * lifecycle — skeleton while fetching, a retryable card on failure — mirrors
 * `CenterProfileSettings`. The form itself lives in `BackupConfigForm`.
 */
export function BackupConfigCard() {
  const { t } = useTranslation();
  const query = useBackupConfig();

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t('settings.backup.configTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {query.isPending && (
          <>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-9 w-40" />
          </>
        )}

        {query.isError && (
          <ErrorState
            icon={<DatabaseBackup className="h-5 w-5" aria-hidden="true" />}
            title={t('settings.backup.configLoadError')}
            action={
              <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                {t('settings.center.retry')}
              </Button>
            }
          />
        )}

        {query.isSuccess && <BackupConfigForm config={query.data.config} />}
      </CardContent>
    </Card>
  );
}
