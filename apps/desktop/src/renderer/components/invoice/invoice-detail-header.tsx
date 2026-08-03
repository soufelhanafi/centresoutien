import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { BilingualText, StatusBadge } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import type { InvoiceListItemView } from '../../lib/invoices/invoice-view';
import { invoiceStatusLabelKey, invoiceStatusTone } from '../../lib/invoices/invoice-status-view';
import { formatMonth } from '../../lib/format';
import { InvoiceDetailActions } from './invoice-detail-actions';

/** Back link, student + month title, lifecycle/payment badge, and the actions row. */
export function InvoiceDetailHeader({
  invoice,
  student,
}: {
  invoice: InvoiceListItemView;
  student: StudentView | undefined;
}) {
  const { t, i18n } = useTranslation();
  const tone = invoiceStatusTone(invoice);

  return (
    <div className="space-y-3">
      <Link
        to="/invoicing"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
        {t('invoices.detail.back')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">{student?.name.fr ?? t('invoices.unknownStudent')}</h1>
            {student && <BilingualText value={student.name.ar} script="arabic" className="text-sm text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{formatMonth(invoice.month, i18n.language)}</span>
            <StatusBadge status={tone} label={t(invoiceStatusLabelKey(tone))} />
          </div>
        </div>

        <InvoiceDetailActions invoice={invoice} />
      </div>
    </div>
  );
}
