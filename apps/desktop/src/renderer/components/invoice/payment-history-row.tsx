import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, Download, Undo2 } from 'lucide-react';
import { Badge, Button, Numeric, toast } from '@centresoutien/ui';
import type { PaymentView } from '../../lib/invoices/payment-view';
import { formatDate, formatMoneyMad } from '../../lib/format';
import { usePrintReceipt } from '../../hooks/invoice/use-print-receipt';
import { useExportReceipt } from '../../hooks/invoice/use-export-receipt';
import { ReversePaymentDialog } from './reverse-payment-dialog';

/**
 * One ledger row (payment or reversal) with its own print/export receipt actions
 * (SOU-101). A reversible payment also exposes a reversal action (SOU-237);
 * `reversible` is decided by the list from the whole ledger.
 */
export function PaymentHistoryRow({
  payment,
  reversible,
}: {
  payment: PaymentView;
  reversible: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'fr';
  const print = usePrintReceipt();
  const exportPdf = useExportReceipt();
  const [reverseOpen, setReverseOpen] = useState(false);

  const onPrint = async () => {
    try {
      await print.mutateAsync({ paymentId: payment.id, locale });
    } catch {
      toast.error(t('invoices.detail.payment.history.printError'));
    }
  };

  const onExport = async () => {
    try {
      const { savedPath } = await exportPdf.mutateAsync({ paymentId: payment.id, locale });
      if (savedPath !== null) toast.success(t('invoices.detail.payment.history.exportSuccess'));
    } catch {
      toast.error(t('invoices.detail.payment.history.exportError'));
    }
  };

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">{formatDate(payment.paidOn, i18n.language)}</span>
          {payment.kind === 'reversal' && (
            <Badge variant="destructive" shape="rounded">
              {t('invoices.detail.payment.history.kind.reversal')}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t(`invoices.detail.payment.methods.${payment.method}`)}</p>
        {payment.note && <p className="truncate text-xs text-muted-foreground">{payment.note}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Numeric className="text-sm font-medium text-foreground">
          {formatMoneyMad(payment.amountMad, i18n.language)}
        </Numeric>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('invoices.detail.payment.history.print')}
          disabled={print.isPending}
          onClick={onPrint}
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('invoices.detail.payment.history.export')}
          disabled={exportPdf.isPending}
          onClick={onExport}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
        </Button>
        {reversible && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('invoices.detail.payment.history.reverse')}
            onClick={() => setReverseOpen(true)}
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
      {reversible && (
        <ReversePaymentDialog payment={payment} open={reverseOpen} onOpenChange={setReverseOpen} />
      )}
    </li>
  );
}
