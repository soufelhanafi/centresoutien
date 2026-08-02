import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { FolderOpen } from 'lucide-react';
import {
  backupConfigInputSchema,
  BACKUP_RETENTION_MIN,
  BACKUP_RETENTION_MAX,
  DEFAULT_BACKUP_RETENTION_COUNT,
  type BackupConfigInput,
} from '@centresoutien/domain';
import { Button, Form, FormControl, FormField, FormItem, FormLabel, Input, toast } from '@centresoutien/ui';
import type { BackupConfigDto } from '../../../shared/ipc/backup-contract';
import { FieldMessage } from '../form/field-message';
import { selectFolder } from '../../lib/settings/dialog';
import { useSaveBackupConfig } from '../../hooks/settings/use-save-backup-config';
import { useCreateBackup } from '../../hooks/settings/use-create-backup';

type BackupConfigFormProps = {
  config: BackupConfigDto;
};

/** The config form itself (SOU-102), separated from `BackupConfigCard`'s load lifecycle. */
export function BackupConfigForm({ config }: BackupConfigFormProps) {
  const { t, i18n } = useTranslation();
  const saveConfig = useSaveBackupConfig();
  const createBackup = useCreateBackup();

  const form = useForm<BackupConfigInput>({
    resolver: zodResolver(backupConfigInputSchema),
    defaultValues: {
      destinationDir: config.destinationDir ?? '',
      retentionCount: config.retentionCount || DEFAULT_BACKUP_RETENTION_COUNT,
    },
  });

  const onPickFolder = async () => {
    const path = await selectFolder();
    if (path) form.setValue('destinationDir', path, { shouldValidate: true });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await saveConfig.mutateAsync(values);
      toast.success(t('settings.backup.configSaveSuccess'));
    } catch {
      toast.error(t('settings.backup.configSaveError'));
    }
  });

  const onBackupNow = async () => {
    const destDir = form.getValues('destinationDir');
    try {
      const { file } = await createBackup.mutateAsync({ destDir });
      const createdAt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(file.createdAt),
      );
      toast.success(t('settings.backup.createSuccess', { date: createdAt }));
    } catch {
      toast.error(t('settings.backup.createError'));
    }
  };

  const destinationDir = form.watch('destinationDir');
  const lastBackupAt = config.lastBackupAt
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(config.lastBackupAt),
      )
    : t('settings.backup.never');

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="destinationDir"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.backup.destinationLabel')}</FormLabel>
              <div className="flex items-center gap-2">
                <FormControl>
                  <Input
                    readOnly
                    dir="ltr"
                    value={field.value}
                    placeholder={t('settings.backup.destinationPlaceholder')}
                  />
                </FormControl>
                <Button type="button" variant="outline" onClick={onPickFolder}>
                  <FolderOpen className="size-4" aria-hidden="true" />
                  {t('settings.backup.destinationPick')}
                </Button>
              </div>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="retentionCount"
          render={({ field }) => (
            <FormItem className="max-w-40">
              <FormLabel>{t('settings.backup.retentionLabel')}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={BACKUP_RETENTION_MIN}
                  max={BACKUP_RETENTION_MAX}
                  step={1}
                  {...field}
                  onChange={(event) => field.onChange(event.target.valueAsNumber)}
                />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />

        <p className="text-xs text-muted-foreground">{t('settings.backup.lastRunLabel', { date: lastBackupAt })}</p>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saveConfig.isPending}>
            {saveConfig.isPending ? t('settings.backup.configSaving') : t('settings.backup.configSubmit')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!destinationDir || createBackup.isPending}
            onClick={onBackupNow}
          >
            {createBackup.isPending ? t('settings.backup.creating') : t('settings.backup.createButton')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
