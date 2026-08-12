import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import type { PaymentView } from '../../lib/invoices/payment-view';
import { usePaymentSummary } from '../../hooks/invoice/use-payment-summary';
import { PaymentHistoryRow } from './payment-history-row';

/**
 * A payment can be reversed only if it is a real payment (not itself a reversal)
 * and no counter-entry already reverses it — a payment is reversed at most once
 * (SOU-233/SOU-237).
 */
function isReversible(payment: PaymentView, ledger: readonly PaymentView[]): boolean {
  if (payment.kind !== 'payment') return false;
  return !ledger.some((row) => row.kind === 'reversal' && row.reversesPaymentId === payment.id);
}

/** Per-invoice payment history: the append-only ledger, oldest first (SOU-101). */
export function PaymentHistoryList({ invoiceId }: { invoiceId: string }) {
  const { t } = useTranslation();
  const query = usePaymentSummary(invoiceId);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{t('invoices.detail.payment.history.title')}</h2>

      {query.isPending && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {query.isError && (
        <ErrorState
          icon={<History className="h-5 w-5" aria-hidden="true" />}
          title={t('invoices.detail.payment.history.loadError')}
          action={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              {t('invoices.loadError.retry')}
            </Button>
          }
        />
      )}

      {query.data && query.data.payments.length === 0 && (
        <EmptyState
          icon={<History className="h-5 w-5" aria-hidden="true" />}
          title={t('invoices.detail.payment.history.emptyTitle')}
          description={t('invoices.detail.payment.history.emptyBody')}
        />
      )}

      {query.data && query.data.payments.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {query.data.payments.map((payment) => (
            <PaymentHistoryRow
              key={payment.id}
              payment={payment}
              reversible={isReversible(payment, query.data.payments)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
