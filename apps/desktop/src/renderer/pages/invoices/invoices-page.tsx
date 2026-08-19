import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInvoices } from '../../hooks/invoice/use-invoices';
import { useStudents } from '../../hooks/student/use-students';
import type { PaymentStatus } from '../../lib/invoices/invoice-view';
import { filterInvoicesBySearch } from '../../lib/invoices/list-utils';
import { InvoiceListToolbar } from '../../components/invoice/invoice-list-toolbar';
import { InvoiceListContent, type InvoiceListStatus } from '../../components/invoice/invoice-list-content';

/** Invoices module (SOU-69): month / status / student-name filterable list. */
export function InvoicesPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | ''>('');

  const query = useInvoices({
    ...(month !== '' && { month }),
    ...(paymentStatus !== '' && { paymentStatus }),
  });
  const studentsQuery = useStudents('');
  const studentsById = useMemo(
    () => new Map((studentsQuery.data ?? []).map((student) => [student.id, student])),
    [studentsQuery.data],
  );

  const invoices = useMemo(
    () => filterInvoicesBySearch(query.data ?? [], studentsById, search),
    [query.data, studentsById, search],
  );
  const isFiltered = search.trim() !== '' || month !== '' || paymentStatus !== '';

  const status: InvoiceListStatus = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : invoices.length > 0
        ? 'ready'
        : isFiltered
          ? 'noResults'
          : 'empty';

  return (
    <section aria-labelledby="invoices-title" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="space-y-1">
        <h1 id="invoices-title" className="text-xl font-semibold text-foreground">
          {t('invoices.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('invoices.subtitle')}</p>
      </header>

      <InvoiceListToolbar
        search={search}
        onSearchChange={setSearch}
        month={month}
        onMonthChange={setMonth}
        paymentStatus={paymentStatus}
        onPaymentStatusChange={setPaymentStatus}
      />

      <InvoiceListContent
        status={status}
        invoices={invoices}
        studentsById={studentsById}
        month={month}
        onRetry={() => void query.refetch()}
      />
    </section>
  );
}
