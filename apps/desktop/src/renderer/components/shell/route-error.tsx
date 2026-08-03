import { useTranslation } from 'react-i18next';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { AlertTriangle } from 'lucide-react';
import { Button, ErrorState } from '@centresoutien/ui';

/** Router's `defaultErrorComponent`: catches render/loader errors from any route. */
export function RouteError({ reset }: ErrorComponentProps) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex h-full w-full max-w-md items-center justify-center">
      <ErrorState
        icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
        title={t('shell.error.title')}
        description={t('shell.error.body')}
        action={
          <Button variant="outline" size="sm" onClick={() => reset()}>
            {t('shell.error.retry')}
          </Button>
        }
      />
    </div>
  );
}
