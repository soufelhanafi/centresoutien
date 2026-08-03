import { useTranslation } from 'react-i18next';
import { Numeric } from '@centresoutien/ui';
import type { ArrearsAgingSummaryView } from '../../lib/arrears/arrears-view';
import { formatMoneyMad } from '../../lib/format';

const CARD_TONE: Record<'30' | '60' | '90+' | 'total', string> = {
  '30': 'text-[var(--badge-info-fg)]',
  '60': 'text-[var(--badge-warning-fg)]',
  '90+': 'text-[var(--badge-destructive-fg)]',
  total: 'text-foreground',
};

/** Center-wide 30/60/90+ aging totals + overall outstanding, reflecting the active filters. */
export function ArrearsAgingSummary({ aging }: { aging: ArrearsAgingSummaryView }) {
  const { t, i18n } = useTranslation();

  const cards: { key: '30' | '60' | '90+' | 'total'; label: string; amountMad: number }[] = [
    { key: '30', label: t('arrears.aging.bucket.30'), amountMad: aging.bucket30Mad },
    { key: '60', label: t('arrears.aging.bucket.60'), amountMad: aging.bucket60Mad },
    { key: '90+', label: t('arrears.aging.bucket.ninetyPlus'), amountMad: aging.bucket90PlusMad },
    { key: 'total', label: t('arrears.aging.total'), amountMad: aging.totalOutstandingMad },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label={t('arrears.aging.groupLabel')}>
      {cards.map((card) => (
        <div key={card.key} className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{card.label}</p>
          <p className={`mt-1 text-lg font-semibold ${CARD_TONE[card.key]}`}>
            <Numeric className="text-lg">{formatMoneyMad(card.amountMad, i18n.language)}</Numeric>
          </p>
        </div>
      ))}
      <p className="col-span-2 text-xs text-muted-foreground sm:col-span-4">
        {t('arrears.aging.parentsCount', { count: aging.parentsCount })}
      </p>
    </div>
  );
}
