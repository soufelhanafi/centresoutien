import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpCircle } from 'lucide-react';
import { Button, cn } from '@centresoutien/ui';

type UpdateCardProps = {
  version: string;
  onInstallNow: () => void;
  onLater: () => void;
  onSkip: () => void;
};

export function UpdateCard({ version, onInstallNow, onLater, onSkip }: UpdateCardProps): ReactElement {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      className={cn(
        'w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-4 shadow-lg',
        'animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none',
      )}
    >
      <div className="flex items-start gap-3">
        <ArrowUpCircle className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{t('update.readyTitle')}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('update.readyDescription', { version })}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onSkip}>
          {t('update.skip')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onLater}>
          {t('update.later')}
        </Button>
        <Button size="sm" onClick={onInstallNow}>
          {t('update.installNow')}
        </Button>
      </div>
    </div>
  );
}
