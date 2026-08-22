import { useTranslation } from 'react-i18next';
import { formatInteger, formatMoneyMad } from '../../lib/format';
import type { DayCloseReport } from './day-close-section.types';
import { DayCloseStatCard } from './day-close-stat-card';
import { DayCloseTotalCollected } from './day-close-total-collected';

/** The read-only figures for a business day: activity tiles + the total-collected headline. */
export function DayCloseFigures({ report }: { report: DayCloseReport }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  return (
    <div className="space-y-4">
      <DayCloseTotalCollected totalMad={report.totalCollectedMad} byMethod={report.collectedByMethod} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <DayCloseStatCard
          label={t('payments.dayClose.newSubscriptions')}
          value={formatInteger(report.newSubscriptions.total, locale)}
          hint={t('payments.dayClose.newSubscriptionsSplit', {
            regular: formatInteger(report.newSubscriptions.regular, locale),
            examPrep: formatInteger(report.newSubscriptions.examPrep, locale),
          })}
        />
        <DayCloseStatCard
          label={t('payments.dayClose.studentsEnrolled')}
          value={formatInteger(report.studentsEnrolled, locale)}
        />
        <DayCloseStatCard
          label={t('payments.dayClose.invoicesGenerated')}
          value={formatInteger(report.invoicesGenerated.count, locale)}
          hint={t('payments.dayClose.invoicesBilled', {
            total: formatMoneyMad(report.invoicesGenerated.totalBilledMad, locale),
          })}
        />
      </div>
    </div>
  );
}
