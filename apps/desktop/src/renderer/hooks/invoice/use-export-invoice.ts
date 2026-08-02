import { useMutation } from '@tanstack/react-query';
import { invoicesGateway } from '../../lib/invoices/invoices-gateway';

/** Renders the invoice PDF in `locale` and saves it to a user-picked location. */
export function useExportInvoice() {
  return useMutation({
    mutationFn: ({ invoiceId, locale }: { invoiceId: string; locale: 'fr' | 'ar' }) =>
      invoicesGateway.export(invoiceId, locale),
  });
}
