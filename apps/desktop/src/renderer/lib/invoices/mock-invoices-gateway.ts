import { foldSearchText, paymentStatusOf } from '@centresoutien/domain';
import type {
  InvoiceListFilters,
  InvoiceListItemView,
  OpenInvoicesPage,
  OpenInvoicesQuery,
} from './invoice-view';
import type { InvoicePaymentSummaryView, PaymentView } from './payment-view';
import type { InvoicesGateway, RecordPaymentInput } from './invoices-gateway';
import type { PaymentReversalErrorCode } from './payment-reversal-error';
import { INVOICE_SEED } from './mock-invoices-seed';

/**
 * A rejection carrying the same stable `code` the real `payment.void` raises, so
 * the mock exercises the renderer's `resolveDomainErrorCode` → `errors.${code}`
 * mapping exactly like production (it reads `error.code` on in-process paths).
 */
function mockDomainError(code: PaymentReversalErrorCode): Error {
  return Object.assign(new Error(code), { code });
}

function matches(invoice: InvoiceListItemView, filters: InvoiceListFilters): boolean {
  if (filters.month !== undefined && invoice.month !== filters.month) return false;
  if (filters.studentId !== undefined && invoice.studentId !== filters.studentId) return false;
  if (filters.paymentStatus !== undefined && invoice.paymentStatus !== filters.paymentStatus) return false;
  return true;
}

/**
 * Mirror the production diacritic-insensitive student-name substring match
 * (SQLite `nfd_fold` UDF === domain `foldSearchText`). A row with no resolved
 * student name never matches a non-empty term, exactly like the SQL `LEFT JOIN`.
 */
function studentNameMatches(invoice: InvoiceListItemView, foldedTerm: string): boolean {
  const name = invoice.studentName;
  if (!name) return false;
  return foldSearchText(name.fr).includes(foldedTerm) || foldSearchText(name.ar).includes(foldedTerm);
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

  async listOpen(query: OpenInvoicesQuery): Promise<OpenInvoicesPage> {
    const term = query.search?.trim() ?? '';
    const foldedTerm = term === '' ? '' : foldSearchText(term);
    const open = [...this.invoices.values()]
      .filter((invoice) => invoice.status !== 'cancelled' && invoice.outstandingMad > 0)
      .filter((invoice) => foldedTerm === '' || studentNameMatches(invoice, foldedTerm))
      .sort((a, b) => b.id.localeCompare(a.id));

    const cursor = query.cursor;
    const afterCursor =
      cursor === undefined ? open : open.filter((invoice) => invoice.id.localeCompare(cursor) < 0);
    const pageSize = query.pageSize ?? afterCursor.length;
    const page = afterCursor.slice(0, pageSize);
    const hasMore = afterCursor.length > page.length;
    return { invoices: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
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

  async reversePayment(paymentId: string, paidOn: string): Promise<void> {
    for (const [invoiceId, rows] of this.ledger) {
      const target = rows.find((row) => row.id === paymentId);
      if (!target) continue;
      if (target.kind === 'reversal') throw mockDomainError('cannot-reverse-reversal');
      if (rows.some((row) => row.kind === 'reversal' && row.reversesPaymentId === paymentId)) {
        throw mockDomainError('payment-already-reversed');
      }

      this.paymentSeq += 1;
      rows.push({
        id: `mock-pay-${this.paymentSeq}`,
        invoiceId,
        kind: 'reversal',
        amountMad: target.amountMad,
        method: target.method,
        paidOn, // reversal's local business day (SOU-244), not the original's
        reversesPaymentId: target.id,
        note: null,
        createdAt: target.createdAt,
      });

      const invoice = this.invoices.get(invoiceId);
      if (invoice) {
        const netPaidMad = invoice.netPaidMad - target.amountMad;
        this.invoices.set(invoiceId, {
          ...invoice,
          netPaidMad,
          outstandingMad: Math.max(0, invoice.totalMad - netPaidMad),
          paymentStatus: paymentStatusOf(invoice.totalMad, netPaidMad),
        });
      }
      return;
    }
    throw mockDomainError('payment-not-found');
  }

  async issue(invoiceId: string): Promise<InvoiceListItemView> {
    const current = this.invoices.get(invoiceId);
    if (!current) throw new Error(`unknown invoice ${invoiceId}`);
    if (current.status !== 'draft') throw new Error(`invoice ${invoiceId} is not a draft`);

    const updated: InvoiceListItemView = { ...current, status: 'issued', issuedAt: new Date().toISOString() };
    this.invoices.set(updated.id, updated);
    return updated;
  }

  async cancel(invoiceId: string): Promise<InvoiceListItemView> {
    const current = this.invoices.get(invoiceId);
    if (!current) throw new Error(`unknown invoice ${invoiceId}`);
    if (current.status === 'cancelled') throw new Error(`invoice ${invoiceId} is already cancelled`);

    const updated: InvoiceListItemView = { ...current, status: 'cancelled' };
    this.invoices.set(updated.id, updated);
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
