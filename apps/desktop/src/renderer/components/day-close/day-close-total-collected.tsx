import { useTranslation } from 'react-i18next';
import { PAYMENT_METHODS } from '@centresoutien/domain';
import { Numeric } from '@centresoutien/ui';
import { formatMoneyMad } from '../../lib/format';
import type { DayCloseReport } from './day-close-section.types';

/** The headline "Total encaissé" figure plus its per-method split for the selected day. */
export function DayCloseTotalCollected({
  totalMad,
  byMethod,
}: {
  totalMad: number;
  byMethod: DayCloseReport['collectedByMethod'];
}) {
  const { t, i18n } = useTranslation();

  return (
    <div className="rounded-xl border border-border bg-accent/40 p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {t('payments.dayClose.totalCollected')}
      </p>
      <Numeric className="mt-1 block text-3xl font-semibold text-foreground">
        {formatMoneyMad(totalMad, i18n.language)}
      </Numeric>
      <div
        className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"
        role="group"
        aria-label={t('payments.dayClose.byMethodLabel')}
      >
        {PAYMENT_METHODS.map((method) => (
          <div key={method} className="rounded-lg border border-border bg-card p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {t(`invoices.detail.payment.methods.${method}`)}
            </p>
            <Numeric className="mt-1 block text-base font-semibold text-foreground">
              {formatMoneyMad(byMethod[method], i18n.language)}
            </Numeric>
          </div>
        ))}
      </div>
    </div>
  );
}
