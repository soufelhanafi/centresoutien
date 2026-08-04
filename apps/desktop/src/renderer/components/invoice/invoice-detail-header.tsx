import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import type { StudentView } from '../../lib/students/student-view';
import type { InvoiceListItemView } from '../../lib/invoices/invoice-view';
import { InvoiceDetailActions } from './invoice-detail-actions';
import { InvoiceDocumentHeader } from './invoice-document-header';

/** Back link + actions row, then the Stripe-style document card (SOU-162). */
export function InvoiceDetailHeader({
  invoice,
  student,
}: {
  invoice: InvoiceListItemView;
  student: StudentView | undefined;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/invoicing"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
          {t('invoices.detail.back')}
        </Link>
        <InvoiceDetailActions invoice={invoice} />
      </div>

      <InvoiceDocumentHeader invoice={invoice} student={student} />
    </div>
  );
}
