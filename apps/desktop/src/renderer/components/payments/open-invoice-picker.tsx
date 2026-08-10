import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, ReceiptText } from 'lucide-react';
import { Button, EmptyState, ErrorState, Input, Skeleton } from '@centresoutien/ui';
import { useInvoices } from '../../hooks/invoice/use-invoices';
import { useStudents } from '../../hooks/student/use-students';
import { filterInvoicesBySearch } from '../../lib/invoices/list-utils';
import { OpenInvoiceRow } from './open-invoice-row';

/** Picks an open invoice (outstanding balance, not cancelled) to record a payment against. */
export function OpenInvoicePicker() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const invoicesQuery = useInvoices({});
  const studentsQuery = useStudents('');

  const studentsById = useMemo(
    () => new Map((studentsQuery.data ?? []).map((student) => [student.id, student])),
    [studentsQuery.data],
  );

  const openInvoices = useMemo(() => {
    const open = (invoicesQuery.data ?? []).filter(
      (invoice) => invoice.status !== 'cancelled' && invoice.outstandingMad > 0,
    );
    return filterInvoicesBySearch(open, studentsById, search);
  }, [invoicesQuery.data, studentsById, search]);

  const hasOpenInvoices =
    (invoicesQuery.data ?? []).some((invoice) => invoice.status !== 'cancelled' && invoice.outstandingMad > 0);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4" aria-labelledby="record-payment-title">
      <div className="space-y-1">
        <h2 id="record-payment-title" className="text-sm font-semibold text-foreground">
          {t('payments.record.title')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('payments.record.subtitle')}</p>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('payments.record.search')}
          aria-label={t('payments.record.searchLabel')}
          className="ps-9"
        />
      </div>

      {invoicesQuery.isPending && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {invoicesQuery.isError && (
        <ErrorState
          icon={<ReceiptText className="h-5 w-5" aria-hidden="true" />}
          title={t('payments.record.loadError')}
          action={
            <Button variant="outline" size="sm" onClick={() => void invoicesQuery.refetch()}>
              {t('payments.retry')}
            </Button>
          }
        />
      )}

      {invoicesQuery.data && openInvoices.length === 0 && (
        <EmptyState
          icon={<ReceiptText className="h-5 w-5" aria-hidden="true" />}
          title={hasOpenInvoices ? t('payments.record.noResultsTitle') : t('payments.record.emptyTitle')}
          description={hasOpenInvoices ? t('payments.record.noResultsBody') : t('payments.record.emptyBody')}
        />
      )}

      {invoicesQuery.data && openInvoices.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {openInvoices.map((invoice) => (
            <OpenInvoiceRow key={invoice.id} invoice={invoice} student={studentsById.get(invoice.studentId)} />
          ))}
        </ul>
      )}
    </section>
  );
}
