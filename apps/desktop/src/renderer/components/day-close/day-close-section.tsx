import { useTranslation } from 'react-i18next';
import { CalendarCheck } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import { DayCloseControls } from './day-close-controls';
import { DayCloseFigures } from './day-close-figures';
import { EncaissementsList } from './encaissements-list';
import type { DayCloseReport, DayCloseSectionProps } from './day-close-section.types';

function isZeroActivityDay(report: DayCloseReport): boolean {
  return (
    report.newSubscriptions.total === 0 &&
    report.studentsEnrolled === 0 &&
    report.invoicesGenerated.count === 0 &&
    report.totalCollectedMad === 0 &&
    report.encaissements.length === 0
  );
}

/**
 * "Clôture du jour" (SOU-300): a read-only end-of-day report on the cash desk. The
 * director picks a business day, reviews the figures inline, and exports/prints the
 * FR-only PDF (generated in the backend). Purely presentational — all data and
 * mutations are wired by the page container.
 */
export function DayCloseSection({ date, report, isLoading, isError, onRetry, actions }: DayCloseSectionProps) {
  const { t } = useTranslation();
  const hasReport = report !== undefined;
  const isEmptyDay = hasReport && isZeroActivityDay(report);

  return (
    <section
      aria-labelledby="day-close-title"
      className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-primary"
            aria-hidden="true"
          >
            <CalendarCheck className="h-4 w-4" />
          </span>
          <div className="space-y-0.5">
            <h2 id="day-close-title" className="text-sm font-semibold text-foreground">
              {t('payments.dayClose.title')}
            </h2>
            <p className="text-xs text-muted-foreground">{t('payments.dayClose.subtitle')}</p>
          </div>
        </div>
        <DayCloseControls date={date} actions={actions} canProduce={hasReport} />
      </header>

      {isLoading && (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {isError && !isLoading && (
        <ErrorState
          icon={<CalendarCheck className="h-5 w-5" aria-hidden="true" />}
          title={t('payments.dayClose.loadError')}
          action={
            <Button variant="outline" size="sm" onClick={onRetry}>
              {t('payments.dayClose.retry')}
            </Button>
          }
        />
      )}

      {report && !isLoading && !isError && isEmptyDay && (
        <EmptyState
          icon={<CalendarCheck className="h-5 w-5" aria-hidden="true" />}
          title={t('payments.dayClose.emptyTitle')}
          description={t('payments.dayClose.emptyBody')}
        />
      )}

      {report && !isLoading && !isError && !isEmptyDay && (
        <div className="space-y-4">
          <DayCloseFigures report={report} />
          <EncaissementsList items={report.encaissements} />
        </div>
      )}
    </section>
  );
}
