import { useMutation } from '@tanstack/react-query';
import { invoicesGateway } from '../../lib/invoices/invoices-gateway';

/** Opens the invoice PDF in the OS print dialog. */
export function usePrintInvoice() {
  return useMutation({
    mutationFn: (invoiceId: string) => invoicesGateway.print(invoiceId),
  });
}
