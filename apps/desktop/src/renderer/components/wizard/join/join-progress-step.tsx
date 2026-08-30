import { useTranslation } from 'react-i18next';
import { Loader2, PlugZap } from 'lucide-react';
import { Button, ErrorState } from '@centresoutien/ui';
import { joinCenterErrorCode } from '../../../lib/hub/hub-join-error';
import { useJoinProgress } from '../../../hooks/hub/use-join-progress';

/**
 * Step 3 of the join branch (SOU-318): the join is running. On success main
 * switches into the joined center and the first-run gate re-renders to its login
 * screen, unmounting this step — so the happy path shows only the spinner. A
 * failure (bad code, unreachable host, wrong center) maps to a localized message
 * with retry / back.
 */
export function JoinProgressStep({
  isError,
  error,
  onRetry,
  onBack,
}: {
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const applied = useJoinProgress();

  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        <ErrorState
          icon={<PlugZap className="h-5 w-5" aria-hidden="true" />}
          title={t('hub.join.progress.errorTitle')}
          description={t(`hub.join.errors.${joinCenterErrorCode(error)}`)}
          action={
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t('hub.join.progress.retry')}
            </Button>
          }
        />
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={onBack}>
            {t('wizard.back')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center" aria-busy="true">
      <Loader2 className="h-6 w-6 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{t('hub.join.progress.joining')}</p>
      {/* Live count from the cold bootstrap's per-page progress — replaces a
          dead spinner with real, moving feedback for a mature center's full
          history. `aria-live` so a screen reader tracks it without re-reading
          the whole region on every update. */}
      {applied > 0 && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {t('hub.join.progress.applied', { count: applied })}
        </p>
      )}
    </div>
  );
}
