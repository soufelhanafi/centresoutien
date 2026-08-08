import { useTranslation } from 'react-i18next';
import { cn, Numeric } from '@centresoutien/ui';
import type { DashboardBasicSummaryView } from '../../lib/dashboard/dashboard-view';

/**
 * One group's enrollment bar (design 1b): localized name, fill = enrolled/capacity,
 * mono `n/cap` count. Exam-prep groups get a purple fill + tiny dashed "PE" chip.
 */
export function EnrollmentBar({ bar }: { bar: DashboardBasicSummaryView['effectifs']['groupBars'][number] }) {
  const { t, i18n } = useTranslation();
  const name = i18n.language === 'ar' ? bar.groupName.ar : bar.groupName.fr;
  const capacity = bar.capacity ?? 0;
  const pct = capacity > 0 ? Math.min(100, Math.round((bar.enrolledCount / capacity) * 100)) : 0;
  const exam = bar.kind === 'exam-prep';

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_1fr_auto] items-center gap-2.5 text-xs">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-medium text-foreground">{name}</span>
        {exam && (
          <span
            className="shrink-0 border border-dashed border-[var(--kind-exam-border)] bg-[var(--kind-exam-bg)] px-1 text-[9.5px] font-bold text-[var(--kind-exam-fg)]"
            aria-label={t('dashboard.basic.effectifs.examPrep')}
          >
            {t('planning.kind.examPrepShort')}
          </span>
        )}
      </span>
      <div
        role="progressbar"
        aria-label={name}
        aria-valuenow={bar.enrolledCount}
        aria-valuemin={0}
        aria-valuemax={capacity}
        className="h-2 overflow-hidden rounded bg-muted"
      >
        <div
          className={cn('h-full rounded', exam ? 'bg-[var(--kind-exam-fg)]' : 'bg-primary')}
          style={{ inlineSize: `${pct}%` }}
        />
      </div>
      <Numeric>
        {bar.enrolledCount}
        {bar.capacity !== null && <span className="text-muted-foreground">/{bar.capacity}</span>}
      </Numeric>
    </li>
  );
}
