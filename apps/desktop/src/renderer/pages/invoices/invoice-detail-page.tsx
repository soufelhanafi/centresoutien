import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, ReceiptText } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '@centresoutien/ui';
import { useInvoice } from '../../hooks/invoice/use-invoice';
import { useStudent } from '../../hooks/student/use-student';
import { InvoiceDetailHeader } from '../../components/invoice/invoice-detail-header';
import { InvoiceLineTable } from '../../components/invoice/invoice-line-table';
import { InvoicePaymentPanel } from '../../components/invoice/invoice-payment-panel';
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
        <EmptyState
          icon={<ReceiptText className="h-5 w-5" aria-hidden="true" />}
          title={query.isError ? t('invoices.loadError.title') : t('invoices.detail.notFoundTitle')}
          description={query.isError ? t('invoices.loadError.body') : t('invoices.detail.notFoundBody')}
          action={
            <Button variant="outline" size="sm" onClick={() => navigate({ to: '/invoicing' })}>
              {t('invoices.detail.back')}
            </Button>
          }
        />
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
        <div className="shrink-0 md:w-72">
          <InvoicePaymentPanel invoice={invoice} />
        </div>
      </div>
    </section>
  );
}
