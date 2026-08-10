import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleDollarSign } from 'lucide-react';
import { Button, Numeric } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import type { InvoiceListItemView } from '../../lib/invoices/invoice-view';
import { formatMonth, formatMoneyMad } from '../../lib/format';
import { RecordPaymentDialog } from '../invoice/record-payment-dialog';

/** One open invoice with an inline "record payment" action, reusing the SOU-101 dialog. */
export function OpenInvoiceRow({
  invoice,
  student,
}: {
  invoice: InvoiceListItemView;
  student: StudentView | undefined;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'fr';
  const [payOpen, setPayOpen] = useState(false);
  const studentName = student ? student.name[locale] : t('payments.unknownStudent');

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <span className="truncate text-sm font-medium text-foreground">{studentName}</span>
        <p className="text-xs text-muted-foreground">{formatMonth(invoice.month, i18n.language)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Numeric className="text-sm font-medium text-foreground">
          {formatMoneyMad(invoice.outstandingMad, i18n.language)}
        </Numeric>
        <Button size="sm" onClick={() => setPayOpen(true)}>
          <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
          {t('payments.record.action')}
        </Button>
      </div>
      <RecordPaymentDialog
        invoiceId={invoice.id}
        outstandingMad={invoice.outstandingMad}
        open={payOpen}
        onOpenChange={setPayOpen}
      />
    </li>
  );
}
