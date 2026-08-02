import { useMutation } from '@tanstack/react-query';
import { invoicesGateway } from '../../lib/invoices/invoices-gateway';

/** Opens a single payment's receipt PDF, rendered in `locale`, in the OS print dialog. */
export function usePrintReceipt() {
  return useMutation({
    mutationFn: ({ paymentId, locale }: { paymentId: string; locale: 'fr' | 'ar' }) =>
      invoicesGateway.printReceipt(paymentId, locale),
  });
}
