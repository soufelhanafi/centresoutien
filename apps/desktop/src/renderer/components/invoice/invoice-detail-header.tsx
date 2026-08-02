import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Printer, Download } from 'lucide-react';
import { BilingualText, Button, StatusBadge, toast } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import type { InvoiceListItemView } from '../../lib/invoices/invoice-view';
import { invoiceStatusLabelKey, invoiceStatusTone } from '../../lib/invoices/invoice-status-view';
import { formatMonth } from '../../lib/format';
import { selectFolder } from '../../lib/settings/dialog';
import { usePrintInvoice } from '../../hooks/invoice/use-print-invoice';
import { useExportInvoice } from '../../hooks/invoice/use-export-invoice';

/** Back link, student + month title, lifecycle/payment badge, print + export actions. */
export function InvoiceDetailHeader({
  invoice,
  student,
}: {
  invoice: InvoiceListItemView;
  student: StudentView | undefined;
}) {
  const { t, i18n } = useTranslation();
  const tone = invoiceStatusTone(invoice);
  const print = usePrintInvoice();
  const exportPdf = useExportInvoice();

  const onPrint = async () => {
    try {
      await print.mutateAsync(invoice.id);
    } catch {
      toast.error(t('invoices.detail.printError'));
    }
  };

  const onExport = async () => {
    const destinationDir = await selectFolder();
    if (!destinationDir) return;
    try {
      await exportPdf.mutateAsync({ invoiceId: invoice.id, destinationDir });
      toast.success(t('invoices.detail.exportSuccess'));
    } catch {
      toast.error(t('invoices.detail.exportError'));
    }
  };

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

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onPrint} disabled={print.isPending}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            {t('invoices.detail.print')}
          </Button>
          <Button variant="outline" onClick={onExport} disabled={exportPdf.isPending}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {t('invoices.detail.export')}
          </Button>
        </div>
      </div>
    </div>
  );
}
