import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, Download, FileCheck2, Ban } from 'lucide-react';
import { Button, toast } from '@centresoutien/ui';
import type { InvoiceListItemView } from '../../lib/invoices/invoice-view';
import { usePrintInvoice } from '../../hooks/invoice/use-print-invoice';
import { useExportInvoice } from '../../hooks/invoice/use-export-invoice';
import { useIssueInvoice } from '../../hooks/invoice/use-issue-invoice';
import { CancelInvoiceDialog } from './cancel-invoice-dialog';

/** Issue (draft only) + cancel (draft/issued, confirm dialog) + print/export actions. */
export function InvoiceDetailActions({ invoice }: { invoice: InvoiceListItemView }) {
  const { t, i18n } = useTranslation();
  const print = usePrintInvoice();
  const exportPdf = useExportInvoice();
  const issueInvoice = useIssueInvoice();
  const [cancelOpen, setCancelOpen] = useState(false);
  const locale = i18n.language === 'ar' ? 'ar' : 'fr';

  const onPrint = async () => {
    try {
      await print.mutateAsync({ invoiceId: invoice.id, locale });
    } catch {
      toast.error(t('invoices.detail.printError'));
    }
  };

  const onExport = async () => {
    try {
      const { savedPath } = await exportPdf.mutateAsync({ invoiceId: invoice.id, locale });
      if (savedPath !== null) toast.success(t('invoices.detail.exportSuccess'));
    } catch {
      toast.error(t('invoices.detail.exportError'));
    }
  };

  const onIssue = async () => {
    try {
      await issueInvoice.mutateAsync(invoice.id);
      toast.success(t('invoices.detail.issue.success'));
    } catch (error) {
      console.error('invoice.issue failed', error);
      toast.error(t('invoices.detail.issue.error'));
    }
  };

  return (
    <div className="flex items-center gap-2">
      {invoice.status === 'draft' && (
        <Button variant="outline" onClick={onIssue} disabled={issueInvoice.isPending}>
          <FileCheck2 className="h-4 w-4" aria-hidden="true" />
          {t('invoices.detail.issue.action')}
        </Button>
      )}
      {invoice.status !== 'cancelled' && (
        <Button variant="outline" onClick={() => setCancelOpen(true)}>
          <Ban className="h-4 w-4" aria-hidden="true" />
          {t('invoices.detail.cancelInvoice.action')}
        </Button>
      )}
      <Button variant="outline" onClick={onPrint} disabled={print.isPending}>
        <Printer className="h-4 w-4" aria-hidden="true" />
        {t('invoices.detail.print')}
      </Button>
      <Button variant="outline" onClick={onExport} disabled={exportPdf.isPending}>
        <Download className="h-4 w-4" aria-hidden="true" />
        {t('invoices.detail.export')}
      </Button>

      <CancelInvoiceDialog invoice={invoice} open={cancelOpen} onOpenChange={setCancelOpen} />
    </div>
  );
}
