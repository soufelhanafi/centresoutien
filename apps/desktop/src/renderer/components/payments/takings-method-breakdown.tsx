import { useTranslation } from 'react-i18next';
import { Numeric } from '@centresoutien/ui';
import type { TakingsSummary } from '../../lib/payments/takings';
import { formatMoneyMad } from '../../lib/format';

/** Per-method netted takings tiles (espèces / virement / chèque / autre) for today. */
export function TakingsMethodBreakdown({ byMethod }: { byMethod: TakingsSummary['byMethod'] }) {
  const { t, i18n } = useTranslation();

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      role="group"
      aria-label={t('payments.takings.byMethodLabel')}
    >
      {byMethod.map(({ method, netMad }) => (
        <div key={method} className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t(`invoices.detail.payment.methods.${method}`)}
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            <Numeric className="text-lg">{formatMoneyMad(netMad, i18n.language)}</Numeric>
          </p>
        </div>
      ))}
    </div>
  );
}
