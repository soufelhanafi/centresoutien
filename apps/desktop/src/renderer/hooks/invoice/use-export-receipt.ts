import { useMutation } from '@tanstack/react-query';
import { invoicesGateway } from '../../lib/invoices/invoices-gateway';

/** Renders a single payment's receipt PDF in `locale` and saves it to a user-picked location. */
export function useExportReceipt() {
  return useMutation({
    mutationFn: ({ paymentId, locale }: { paymentId: string; locale: 'fr' | 'ar' }) =>
      invoicesGateway.exportReceipt(paymentId, locale),
  });
}
