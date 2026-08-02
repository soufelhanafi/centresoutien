import { useMutation } from '@tanstack/react-query';
import { invoicesGateway } from '../../lib/invoices/invoices-gateway';

/** Saves the invoice PDF under a native-picked destination folder. */
export function useExportInvoice() {
  return useMutation({
    mutationFn: ({ invoiceId, destinationDir }: { invoiceId: string; destinationDir: string }) =>
      invoicesGateway.export(invoiceId, destinationDir),
  });
}
