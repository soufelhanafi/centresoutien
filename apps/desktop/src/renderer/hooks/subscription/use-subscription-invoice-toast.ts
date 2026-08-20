import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { toast } from '@centresoutien/ui';
import {
  mapSubscriptionInvoiceOutcome,
  type SubscriptionInvoiceFeedback,
} from '../../lib/subscriptions/subscription-invoice-outcome';
import type { SubscriptionCreateResult } from '../../lib/subscriptions/subscriptions-gateway';

function toastFor(tone: SubscriptionInvoiceFeedback['tone']): typeof toast.success {
  if (tone === 'warning') return toast.warning;
  if (tone === 'info') return toast.info;
  return toast.success;
}

/**
 * Surfaces the first-invoice outcome of `subscription.create` (SOU-289) as a
 * toast: success when the start month's invoice is ready (with a "view invoice"
 * action navigating to its detail), info/warning for the other outcomes, and the
 * plain wizard success when the outcome is silent.
 */
export function useSubscriptionInvoiceToast() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (result: SubscriptionCreateResult) => {
    const feedback = mapSubscriptionInvoiceOutcome(result.invoiceOutcome, result.invoiceId);
    if (feedback === null) {
      toast.success(t('students.subscription.wizard.success'));
      return;
    }
    const invoiceId = feedback.invoiceId;
    toastFor(feedback.tone)(
      t(feedback.messageKey),
      invoiceId === null
        ? undefined
        : {
            action: {
              label: t('students.subscription.wizard.invoice.view'),
              onClick: () => void navigate({ to: '/invoicing/$invoiceId', params: { invoiceId } }),
            },
          },
    );
  };
}
