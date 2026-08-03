import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@centresoutien/ui';
import type { InvoiceListItemView } from '../../lib/invoices/invoice-view';
import { formatMoneyMad } from '../../lib/format';
import { useCancelInvoice } from '../../hooks/invoice/use-cancel-invoice';

/**
 * Confirms cancelling an invoice (terminal, no-undo — draft|issued -> cancelled).
 * Warns when the invoice has recorded payments: `CancelInvoice` allows this
 * silently (payments are append-only/orthogonal to invoice status), but a
 * director cancelling a paid invoice is a real footgun (KICKOFF, SOU-143).
 */
export function CancelInvoiceDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: InvoiceListItemView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const cancelInvoice = useCancelInvoice();
  const hasPayments = invoice.netPaidMad > 0;

  const handleConfirm = async () => {
    try {
      await cancelInvoice.mutateAsync(invoice.id);
      toast.success(t('invoices.detail.cancelInvoice.success'));
      onOpenChange(false);
    } catch (error) {
      console.error('invoice.cancel failed', error);
      toast.error(t('invoices.detail.cancelInvoice.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('invoices.detail.cancelInvoice.dismiss')}>
        <DialogHeader>
          <DialogTitle>{t('invoices.detail.cancelInvoice.title')}</DialogTitle>
          <DialogDescription>
            {hasPayments
              ? t('invoices.detail.cancelInvoice.bodyWithPayments', {
                  amount: formatMoneyMad(invoice.netPaidMad, i18n.language),
                })
              : t('invoices.detail.cancelInvoice.body')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('invoices.detail.cancelInvoice.dismiss')}
          </Button>
          <Button type="button" variant="destructive" disabled={cancelInvoice.isPending} onClick={handleConfirm}>
            {t('invoices.detail.cancelInvoice.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
