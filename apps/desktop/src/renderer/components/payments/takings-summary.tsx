import { useTranslation } from 'react-i18next';
import { Wallet } from 'lucide-react';
import { Button, ErrorState, Numeric, Skeleton } from '@centresoutien/ui';
import { useTodayTakings } from '../../hooks/payments/use-today-takings';
import { formatMoneyMad } from '../../lib/format';
import { TakingsMethodBreakdown } from './takings-method-breakdown';

/** Today's netted cash-desk takings: total + payment count + by-method split (SOU-198). */
export function TakingsSummary() {
  const { t, i18n } = useTranslation();
  const { query, summary } = useTodayTakings();

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm" aria-labelledby="takings-title">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-primary" aria-hidden="true">
          <Wallet className="h-4 w-4" />
        </span>
        <h2 id="takings-title" className="text-sm font-semibold text-foreground">
          {t('payments.takings.title')}
        </h2>
      </div>

      {query.isPending && (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {query.isError && (
        <ErrorState
          icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
          title={t('payments.takings.loadError')}
          action={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              {t('payments.retry')}
            </Button>
          }
        />
      )}

      {query.data && (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <Numeric className="text-2xl font-semibold text-foreground">
              {formatMoneyMad(summary.netMad, i18n.language)}
            </Numeric>
            <p className="text-sm text-muted-foreground">
              {t('payments.takings.count', { count: summary.paymentCount })}
            </p>
          </div>
          <TakingsMethodBreakdown byMethod={summary.byMethod} />
        </>
      )}
    </section>
  );
}
