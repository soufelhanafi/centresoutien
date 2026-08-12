import { useTranslation } from 'react-i18next';
import { CalendarClock, CircleCheck } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import type { StrandedSessionView } from '../../lib/schedule-audit/stranded-session-view';
import { StrandedSessionRow } from './stranded-session-row';

export type ScheduleAuditStatus = 'loading' | 'error' | 'empty' | 'ready';

type ScheduleAuditListProps = {
  status: ScheduleAuditStatus;
  stranded: readonly StrandedSessionView[];
  onRetry: () => void;
};

/** Renders the correct state for the audit report: loading, error, empty, or list. */
export function ScheduleAuditList({ status, stranded, onRetry }: ScheduleAuditListProps) {
  const { t } = useTranslation();

  if (status === 'loading') {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <ErrorState
        icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
        title={t('scheduleAudit.loadError.title')}
        description={t('scheduleAudit.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('scheduleAudit.loadError.retry')}
          </Button>
        }
      />
    );
  }

  if (status === 'empty') {
    return (
      <EmptyState
        icon={<CircleCheck className="h-5 w-5" aria-hidden="true" />}
        title={t('scheduleAudit.empty.title')}
        description={t('scheduleAudit.empty.body')}
      />
    );
  }

  return (
    <ul className="space-y-2.5">
      {stranded.map((item) => (
        <StrandedSessionRow key={item.session.id} stranded={item} />
      ))}
    </ul>
  );
}
