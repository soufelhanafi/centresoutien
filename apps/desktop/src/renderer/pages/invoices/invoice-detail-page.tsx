import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, ReceiptText } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import { useInvoice } from '../../hooks/invoice/use-invoice';
import { useStudent } from '../../hooks/student/use-student';
import { InvoiceDetailHeader } from '../../components/invoice/invoice-detail-header';
import { InvoiceLineTable } from '../../components/invoice/invoice-line-table';
import { InvoicePaymentPanel } from '../../components/invoice/invoice-payment-panel';
import { InvoiceAllocationCard } from '../../components/invoice/invoice-allocation-card';
import { PaymentHistoryList } from '../../components/invoice/payment-history-list';

/** Invoice detail: header actions, kind-grouped line breakdown, payment panel. */
export function InvoiceDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { invoiceId } = useParams({ from: '/invoicing/$invoiceId' });
  const query = useInvoice(invoiceId);
  const studentQuery = useStudent(query.data?.studentId ?? '');

  if (query.isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4" aria-busy="true">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError || query.data === null) {
    return (
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Link
          to="/invoicing"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
          {t('invoices.detail.back')}
        </Link>
        {query.isError ? (
          <ErrorState
            icon={<ReceiptText className="h-5 w-5" aria-hidden="true" />}
            title={t('invoices.loadError.title')}
            description={t('invoices.loadError.body')}
            action={
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                {t('invoices.loadError.retry')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<ReceiptText className="h-5 w-5" aria-hidden="true" />}
            title={t('invoices.detail.notFoundTitle')}
            description={t('invoices.detail.notFoundBody')}
            action={
              <Button variant="outline" size="sm" onClick={() => navigate({ to: '/invoicing' })}>
                {t('invoices.detail.back')}
              </Button>
            }
          />
        )}
      </section>
    );
  }

  const invoice = query.data;

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <InvoiceDetailHeader invoice={invoice} student={studentQuery.data ?? undefined} />
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="flex-1 space-y-4">
          <InvoiceLineTable invoice={invoice} />
          <PaymentHistoryList invoiceId={invoice.id} />
        </div>
        <div className="flex shrink-0 flex-col gap-4 md:w-72">
          <InvoicePaymentPanel invoice={invoice} />
          <InvoiceAllocationCard invoice={invoice} />
        </div>
      </div>
    </section>
  );
}
