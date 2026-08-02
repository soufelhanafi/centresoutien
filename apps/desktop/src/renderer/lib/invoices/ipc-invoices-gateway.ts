import type { InvoiceListFilters, InvoiceListItemView } from './invoice-view';
import type { InvoicesGateway, RecordPaymentInput } from './invoices-gateway';

/**
 * The real {@link InvoicesGateway}: maps each method onto its typed IPC channel
 * (SOU-69). `recordPayment` reuses the already-shipped `payment.record` channel
 * (SOU-93) and reads the updated view back through `get`, the same
 * write-then-read-back pattern as `ipc-students-gateway.ts`.
 */
class IpcInvoicesGateway implements InvoicesGateway {
  async list(filters: InvoiceListFilters): Promise<readonly InvoiceListItemView[]> {
    const { invoices } = await window.api.invoke('invoice.list', {
      ...(filters.month !== undefined && { month: filters.month }),
      ...(filters.studentId !== undefined && { studentId: filters.studentId }),
      ...(filters.paymentStatus !== undefined && { paymentStatus: filters.paymentStatus }),
    });
    return invoices;
  }

  async get(id: string): Promise<InvoiceListItemView | null> {
    const { invoices } = await window.api.invoke('invoice.list', { invoiceId: id });
    return invoices[0] ?? null;
  }

  async recordPayment(input: RecordPaymentInput): Promise<InvoiceListItemView> {
    await window.api.invoke('payment.record', input);
    const updated = await this.get(input.invoiceId);
    if (updated === null) {
      throw new Error(`invoice ${input.invoiceId} was paid but could not be read back`);
    }
    return updated;
  }

  async print(id: string, locale: 'fr' | 'ar'): Promise<void> {
    await window.api.invoke('invoice.print', { invoiceId: id, locale });
  }

  async export(id: string, locale: 'fr' | 'ar'): Promise<{ savedPath: string | null }> {
    return window.api.invoke('invoice.export', { invoiceId: id, locale });
  }
}

export const ipcInvoicesGateway: InvoicesGateway = new IpcInvoicesGateway();
