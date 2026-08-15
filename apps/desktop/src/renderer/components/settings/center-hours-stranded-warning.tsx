import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { CalendarClock } from 'lucide-react';
import { Button } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useStrandedSessions } from '../../hooks/schedule-audit/use-stranded-sessions';
import { planningModule } from '../../app/nav-items';

/**
 * Warns, at the moment the director saves new opening hours (SOU-251), that some
 * future sessions now fall outside those hours. The count comes from the shared
 * {@link useStrandedSessions} server seam — never re-derived here — and refreshes
 * because the save mutation invalidates `scheduleAuditKeys.outsideHours()`. The
 * review CTA sends the admin to Planning, where the existing audit dialog lets
 * them settle each stranded session. Renders nothing when the feature is off or
 * no session is stranded.
 */
export function CenterHoursStrandedWarning() {
  const { t } = useTranslation();
  const hasCenterHours = useFeature('settings.center-hours');
  const query = useStrandedSessions();
  // On a loading/errored audit `data` is undefined and the warning stays hidden:
  // a transient IPC failure must not fabricate a scary count, and the same
  // stranded flag is always reachable from the Planning audit dialog regardless.
  const count = query.data?.length ?? 0;

  if (!hasCenterHours || count === 0) {
    return null;
  }

  return (
    <div
      role="status"
      className="flex w-full max-w-2xl items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex flex-1 flex-col items-start gap-2">
        <p>{t('centerHours.strandedWarning.message', { count })}</p>
        <Button asChild variant="outline" size="sm">
          <Link to={planningModule.path}>{t('centerHours.strandedWarning.reviewCta')}</Link>
        </Button>
      </div>
    </div>
  );
}
