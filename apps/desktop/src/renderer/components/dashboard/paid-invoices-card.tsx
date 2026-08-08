import { useTranslation } from 'react-i18next';
import { Numeric } from '@centresoutien/ui';

/** The "Factures payées" card (design 1b): paid count over total + teal progress bar. */
export function PaidInvoicesCard({ paidCount, totalCount }: { paidCount: number; totalCount: number }) {
  const { t } = useTranslation();
  const pct = totalCount > 0 ? Math.min(100, (paidCount / totalCount) * 100) : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{t('dashboard.basic.argent.paidInvoices')}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
        <Numeric>
          <span dir="ltr">
            {paidCount}
            <span className="text-sm font-normal text-muted-foreground">/{totalCount}</span>
          </span>
        </Numeric>
      </p>
      <div
        role="progressbar"
        aria-label={t('dashboard.basic.argent.paidInvoices')}
        aria-valuenow={paidCount}
        aria-valuemin={0}
        aria-valuemax={totalCount}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary" style={{ inlineSize: `${pct}%` }} />
      </div>
    </div>
  );
}
