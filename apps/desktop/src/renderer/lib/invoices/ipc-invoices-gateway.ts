import type {
  InvoiceListFilters,
  InvoiceListItemView,
  OpenInvoicesPage,
  OpenInvoicesQuery,
} from './invoice-view';
import type { InvoicePaymentSummaryView } from './payment-view';
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

  async listOpen(query: OpenInvoicesQuery): Promise<OpenInvoicesPage> {
    const { invoices, nextCursor } = await window.api.invoke('invoice.list', {
      openOnly: true,
      ...(query.search !== undefined && query.search !== '' && { search: query.search }),
      ...(query.pageSize !== undefined && { pageSize: query.pageSize }),
      ...(query.cursor !== undefined && { cursor: query.cursor }),
    });
    return { invoices, nextCursor };
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

  async issue(invoiceId: string): Promise<InvoiceListItemView> {
    await window.api.invoke('invoice.issue', { invoiceId });
    const updated = await this.get(invoiceId);
    if (updated === null) {
      throw new Error(`invoice ${invoiceId} was issued but could not be read back`);
    }
    return updated;
  }

  async cancel(invoiceId: string): Promise<InvoiceListItemView> {
    await window.api.invoke('invoice.cancel', { invoiceId });
    const updated = await this.get(invoiceId);
    if (updated === null) {
      throw new Error(`invoice ${invoiceId} was cancelled but could not be read back`);
    }
    return updated;
  }

  async print(id: string, locale: 'fr' | 'ar'): Promise<void> {
    await window.api.invoke('invoice.print', { invoiceId: id, locale });
  }

  async export(id: string, locale: 'fr' | 'ar'): Promise<{ savedPath: string | null }> {
    return window.api.invoke('invoice.export', { invoiceId: id, locale });
  }

  async paymentSummary(invoiceId: string): Promise<InvoicePaymentSummaryView> {
    return window.api.invoke('payment.summary', { invoiceId });
  }

  async printReceipt(paymentId: string, locale: 'fr' | 'ar'): Promise<void> {
    await window.api.invoke('payment.receipt.print', { paymentId, locale });
  }

  async exportReceipt(paymentId: string, locale: 'fr' | 'ar'): Promise<{ savedPath: string | null }> {
    return window.api.invoke('payment.receipt.export', { paymentId, locale });
  }
}

export const ipcInvoicesGateway: InvoicesGateway = new IpcInvoicesGateway();
