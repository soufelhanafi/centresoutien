import { useTranslation } from 'react-i18next';
import { Numeric } from '@centresoutien/ui';
import { formatIsoTime, formatMoneyMad } from '../../lib/format';
import type { DayCloseReport } from './day-close-section.types';

/** The chronological list of the day's individual encaissements (who / when / how much). */
export function EncaissementsList({ items }: { items: DayCloseReport['encaissements'] }) {
  const { t, i18n } = useTranslation();

  return (
    <section aria-labelledby="day-close-encaissements-title" className="space-y-2">
      <h3
        id="day-close-encaissements-title"
        className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
      >
        {t('payments.dayClose.encaissements.title')}
      </h3>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          {t('payments.dayClose.encaissements.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {items.map((entry, index) => (
            <li
              key={`${entry.at}-${index}`}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0 space-y-0.5">
                <span className="truncate text-sm font-medium text-foreground">{entry.studentName}</span>
                <p className="text-xs text-muted-foreground">{formatIsoTime(entry.at, i18n.language)}</p>
              </div>
              <Numeric className="shrink-0 text-sm font-medium text-foreground">
                {formatMoneyMad(entry.amountMad, i18n.language)}
              </Numeric>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
