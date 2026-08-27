import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { XCircle } from 'lucide-react';
import { Button } from '@centresoutien/ui';
import { formatInteger } from '../../lib/format';
import type { SyncProgress } from '../../hooks/sync/use-sync-progress';

type SyncProgressCardProps = {
  readonly progress: SyncProgress;
  readonly onStop: () => void;
  readonly stopping: boolean;
};

/** Live "X / Y" bar with an ETA and a graceful Stop control, shown while a
 *  chunked sync run is in flight (SOU-330). */
export function SyncProgressCard({ progress, onStop, stopping }: SyncProgressCardProps): ReactElement {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const percent = Math.round(progress.ratio * 100);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {t('sync.progress.count', {
            pulled: formatInteger(progress.pulled, locale),
            total: formatInteger(progress.total, locale),
          })}
        </span>
        <span className="text-xs text-muted-foreground">{remainingLabel(progress.etaSeconds, t, locale)}</span>
      </div>

      <div
        role="progressbar"
        aria-label={t('sync.progress.ariaLabel')}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.pulled}
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary transition-[inline-size]" style={{ inlineSize: `${percent}%` }} />
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onStop} disabled={stopping}>
          <XCircle className="h-4 w-4" aria-hidden="true" />
          {t('sync.progress.stop')}
        </Button>
      </div>
    </div>
  );
}

function remainingLabel(etaSeconds: number | null, t: TFunction, locale: string): string {
  if (etaSeconds === null) return t('sync.progress.estimating');
  if (etaSeconds < 60) {
    return t('sync.progress.remainingSeconds', {
      seconds: formatInteger(Math.max(1, Math.ceil(etaSeconds)), locale),
    });
  }
  return t('sync.progress.remainingMinutes', {
    minutes: formatInteger(Math.ceil(etaSeconds / 60), locale),
  });
}
