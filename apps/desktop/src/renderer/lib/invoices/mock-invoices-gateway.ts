import { paymentStatusOf } from '@centresoutien/domain';
import type { InvoiceListFilters, InvoiceListItemView } from './invoice-view';
import type { InvoicePaymentSummaryView, PaymentView } from './payment-view';
import type { InvoicesGateway, RecordPaymentInput } from './invoices-gateway';
import { INVOICE_SEED } from './mock-invoices-seed';

function matches(invoice: InvoiceListItemView, filters: InvoiceListFilters): boolean {
  if (filters.month !== undefined && invoice.month !== filters.month) return false;
  if (filters.studentId !== undefined && invoice.studentId !== filters.studentId) return false;
  if (filters.paymentStatus !== undefined && invoice.paymentStatus !== filters.paymentStatus) return false;
  return true;
}

/** In-memory stand-in for the not-yet-published invoice channels (see `invoices-gateway.ts`). */
export class MockInvoicesGateway implements InvoicesGateway {
  private readonly invoices = new Map<string, InvoiceListItemView>(INVOICE_SEED.map((i) => [i.id, i]));
  private readonly ledger = new Map<string, PaymentView[]>();
  private paymentSeq = 0;

  async list(filters: InvoiceListFilters): Promise<readonly InvoiceListItemView[]> {
    return [...this.invoices.values()]
      .filter((invoice) => matches(invoice, filters))
      .sort((a, b) => b.month.localeCompare(a.month));
  }

  async get(id: string): Promise<InvoiceListItemView | null> {
    return this.invoices.get(id) ?? null;
  }

  async recordPayment(input: RecordPaymentInput): Promise<InvoiceListItemView> {
    const current = this.invoices.get(input.invoiceId);
    if (!current) throw new Error(`unknown invoice ${input.invoiceId}`);

    const netPaidMad = current.netPaidMad + input.amountMad;
    const updated: InvoiceListItemView = {
      ...current,
      netPaidMad,
      outstandingMad: Math.max(0, current.totalMad - netPaidMad),
      paymentStatus: paymentStatusOf(current.totalMad, netPaidMad),
    };
    this.invoices.set(updated.id, updated);

    this.paymentSeq += 1;
    const rows = this.ledger.get(input.invoiceId) ?? [];
    rows.push({
      id: `mock-pay-${this.paymentSeq}`,
      invoiceId: input.invoiceId,
      kind: 'payment',
      amountMad: input.amountMad,
      method: input.method,
      paidOn: input.paidOn,
      reversesPaymentId: null,
      note: input.note ?? null,
      createdAt: new Date().toISOString(),
    });
    this.ledger.set(input.invoiceId, rows);

    return updated;
  }

  async print(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  async export(): Promise<{ savedPath: string | null }> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { savedPath: '/tmp/facture.pdf' };
  }

  async paymentSummary(invoiceId: string): Promise<InvoicePaymentSummaryView> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new Error(`unknown invoice ${invoiceId}`);
    return {
      invoiceId,
      totalMad: invoice.totalMad,
      netPaidMad: invoice.netPaidMad,
      outstandingMad: invoice.outstandingMad,
      status: invoice.paymentStatus,
      payments: this.ledger.get(invoiceId) ?? [],
    };
  }

  async printReceipt(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  async exportReceipt(): Promise<{ savedPath: string | null }> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { savedPath: '/tmp/recu-paiement.pdf' };
  }
}

export const mockInvoicesGateway = new MockInvoicesGateway();
