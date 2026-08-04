import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleDollarSign } from 'lucide-react';
import { Button, Numeric } from '@centresoutien/ui';
import type { InvoiceListItemView } from '../../lib/invoices/invoice-view';
import { formatMoneyMad } from '../../lib/format';
import { RecordPaymentDialog } from './record-payment-dialog';

/** Total / net paid / outstanding + the "mark paid" entry point (SOU-93 ledger, SOU-69 UI). */
export function InvoicePaymentPanel({ invoice }: { invoice: InvoiceListItemView }) {
  const { t, i18n } = useTranslation();
  const [payOpen, setPayOpen] = useState(false);
  // `RecordPayment` (domain) has no lifecycle-status guard, so payments are accepted
  // on both draft and issued invoices — only `cancelled` blocks recording a payment.
  const canRecordPayment = invoice.status !== 'cancelled' && invoice.outstandingMad > 0;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">{t('invoices.detail.payment.panelTitle')}</h2>
      <dl className="space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <dt className="text-muted-foreground">{t('invoices.detail.payment.total')}</dt>
          <dd>
            <Numeric>{formatMoneyMad(invoice.totalMad, i18n.language)}</Numeric>
          </dd>
        </div>
        <div className="flex items-center justify-between text-sm">
          <dt className="text-muted-foreground">{t('invoices.detail.payment.netPaid')}</dt>
          <dd>
            <Numeric>{formatMoneyMad(invoice.netPaidMad, i18n.language)}</Numeric>
          </dd>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2.5 text-sm font-semibold">
          <dt className="text-foreground">{t('invoices.detail.payment.outstanding')}</dt>
          <dd>
            <Numeric className="font-semibold text-foreground">
              {formatMoneyMad(invoice.outstandingMad, i18n.language)}
            </Numeric>
          </dd>
        </div>
      </dl>

      {canRecordPayment && (
        <Button size="sm" className="w-full" onClick={() => setPayOpen(true)}>
          <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
          {t('invoices.detail.payment.markPaid')}
        </Button>
      )}

      <RecordPaymentDialog
        invoiceId={invoice.id}
        outstandingMad={invoice.outstandingMad}
        open={payOpen}
        onOpenChange={setPayOpen}
      />
    </div>
  );
}
