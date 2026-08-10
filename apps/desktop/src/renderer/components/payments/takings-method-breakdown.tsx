import { useTranslation } from 'react-i18next';
import { PAYMENT_METHODS } from '@centresoutien/domain';
import { Numeric } from '@centresoutien/ui';
import type { DayTakingsView } from '../../lib/payments/day-takings-view';
import { formatMoneyMad } from '../../lib/format';

/** Per-method netted takings tiles (espèces / virement / chèque / autre) for today. */
export function TakingsMethodBreakdown({ byMethod }: { byMethod: DayTakingsView['byMethod'] }) {
  const { t, i18n } = useTranslation();

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      role="group"
      aria-label={t('payments.takings.byMethodLabel')}
    >
      {PAYMENT_METHODS.map((method) => (
        <div key={method} className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t(`invoices.detail.payment.methods.${method}`)}
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            <Numeric className="text-lg">{formatMoneyMad(byMethod[method], i18n.language)}</Numeric>
          </p>
        </div>
      ))}
    </div>
  );
}
