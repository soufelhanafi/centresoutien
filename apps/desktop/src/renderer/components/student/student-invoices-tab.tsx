import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { StudentView } from '../../lib/students/student-view';
import { useInvoices } from '../../hooks/invoice/use-invoices';
import { InvoiceListContent, type InvoiceListStatus } from '../invoice/invoice-list-content';

/**
 * The student detail's Factures tab (SOU-289): the student's own invoices via
 * the shared `invoice.list` read (filtered by studentId server-side), rendered
 * with the same list states and rows as the Facturation page. Rows link to the
 * invoice detail. The `invoiceKeys` cache is invalidated on subscription
 * creation, so an enrollment-drafted invoice appears here immediately.
 */
export function StudentInvoicesTab({ student }: { student: StudentView }) {
  const { t } = useTranslation();
  const query = useInvoices({ studentId: student.id });
  const invoices = query.data ?? [];
  const studentsById = useMemo(() => new Map([[student.id, student]]), [student]);

  const status: InvoiceListStatus = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : invoices.length > 0
        ? 'ready'
        : 'empty';

  return (
    <InvoiceListContent
      status={status}
      invoices={invoices}
      studentsById={studentsById}
      onRetry={() => void query.refetch()}
      empty={{
        title: t('students.invoices.empty.title'),
        description: t('students.invoices.empty.body'),
      }}
    />
  );
}
