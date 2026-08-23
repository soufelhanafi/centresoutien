import { useTranslation } from 'react-i18next';
import { formatMoneyMad, formatInteger, formatPercent } from '../../lib/format';
import type { MultiCenterStatsTotalsView } from '../../lib/multi-center-stats/multi-center-stats-view';

const CARD = 'flex flex-col gap-1 rounded-xl border border-border bg-card p-4';
const LABEL = 'text-xs font-bold uppercase tracking-wider text-muted-foreground';
const VALUE = 'text-lg font-semibold text-foreground tabular-nums';

/** Whole-install roll-up across every available center (design 1b KPI cards). */
export function MultiCenterStatsTotals({
  totals,
  locale,
}: {
  totals: MultiCenterStatsTotalsView;
  locale: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
      <div className={CARD}>
        <p className={LABEL}>{t('multiCenterStats.totals.revenue')}</p>
        <p className={VALUE}>{formatMoneyMad(totals.revenueMad, locale)}</p>
      </div>
      <div className={CARD}>
        <p className={LABEL}>{t('multiCenterStats.totals.collected')}</p>
        <p className={VALUE}>{formatMoneyMad(totals.collectedMad, locale)}</p>
      </div>
      <div className={CARD}>
        <p className={LABEL}>{t('multiCenterStats.totals.students')}</p>
        <p className={VALUE}>{formatInteger(totals.studentCount, locale)}</p>
      </div>
      <div className={CARD}>
        <p className={LABEL}>{t('multiCenterStats.totals.unpaidRate')}</p>
        <p className={VALUE}>
          {totals.unpaidRate === null ? '—' : formatPercent(totals.unpaidRate * 100, locale)}
        </p>
      </div>
    </div>
  );
}
