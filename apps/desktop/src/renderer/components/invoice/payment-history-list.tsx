import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import { EmptyState, Skeleton } from '@centresoutien/ui';
import { usePaymentSummary } from '../../hooks/invoice/use-payment-summary';
import { PaymentHistoryRow } from './payment-history-row';

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

      {query.isError && <p className="text-sm text-destructive">{t('invoices.detail.payment.history.loadError')}</p>}

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
            <PaymentHistoryRow key={payment.id} payment={payment} />
          ))}
        </ul>
      )}
    </div>
  );
}
