import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoicesGateway } from '../../lib/invoices/invoices-gateway';
import { invoiceKeys } from './keys';

/** The "Générer les factures du mois" bulk action. Invalidates the invoice list on success. */
export function useGenerateMonthlyInvoices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (month: string) => invoicesGateway.generateMonthly(month),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invoiceKeys.all }),
  });
}
