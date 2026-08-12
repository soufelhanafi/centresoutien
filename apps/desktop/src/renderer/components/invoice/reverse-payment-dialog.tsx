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
import type { PaymentView } from '../../lib/invoices/payment-view';
import { formatDate, formatMoneyMad } from '../../lib/format';
import { mapPaymentReversalError } from '../../lib/invoices/payment-reversal-error';
import { useReversePayment } from '../../hooks/invoice/use-reverse-payment';

/**
 * Confirms reversing a recorded payment (SOU-237). The reversal is an append-only
 * counter-entry — never an edit or delete — so the copy frames it as a permanent,
 * traceable correction. The confirm button is disabled while the mutation is
 * pending so a rapid double-click cannot fire a second `payment.void`; the real
 * one-reversal guarantee lives in the DB transaction (SOU-233).
 */
export function ReversePaymentDialog({
  payment,
  open,
  onOpenChange,
}: {
  payment: PaymentView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const reversePayment = useReversePayment();

  const handleConfirm = async () => {
    try {
      await reversePayment.mutateAsync(payment.id);
      toast.success(t('invoices.detail.payment.history.reverseDialog.success'));
      onOpenChange(false);
    } catch (error) {
      const code = mapPaymentReversalError(error);
      toast.error(code !== null ? t(`errors.${code}`) : t('invoices.detail.payment.history.reverseDialog.error'));
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('invoices.detail.payment.history.reverseDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('invoices.detail.payment.history.reverseDialog.body', {
              amount: formatMoneyMad(payment.amountMad, i18n.language),
              method: t(`invoices.detail.payment.methods.${payment.method}`),
              date: formatDate(payment.paidOn, i18n.language),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('invoices.detail.payment.history.reverseDialog.dismiss')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={reversePayment.isPending}
            onClick={handleConfirm}
          >
            {t('invoices.detail.payment.history.reverseDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
