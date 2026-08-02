import { useMutation } from '@tanstack/react-query';
import { invoicesGateway } from '../../lib/invoices/invoices-gateway';

/** Opens the invoice PDF, rendered in `locale`, in the OS print dialog. */
export function usePrintInvoice() {
  return useMutation({
    mutationFn: ({ invoiceId, locale }: { invoiceId: string; locale: 'fr' | 'ar' }) =>
      invoicesGateway.print(invoiceId, locale),
  });
}
