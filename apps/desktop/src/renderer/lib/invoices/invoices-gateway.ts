import type { RecordPaymentFields } from '@centresoutien/domain';
import type { InvoiceListFilters, InvoiceListItemView } from './invoice-view';
import type { InvoicePaymentSummaryView } from './payment-view';
import { ipcInvoicesGateway } from './ipc-invoices-gateway';

/** A direct alias of the domain's own `recordPaymentSchema` shape (already shipped, SOU-93). */
export type RecordPaymentInput = RecordPaymentFields;

/**
 * The seam the Invoice UI depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is
 * swappable in one place with no change to any component.
 */
export interface InvoicesGateway {
  list(filters: InvoiceListFilters): Promise<readonly InvoiceListItemView[]>;
  get(id: string): Promise<InvoiceListItemView | null>;
  recordPayment(input: RecordPaymentInput): Promise<InvoiceListItemView>;
  /** Moves a draft invoice to `issued`. Returns the updated invoice (write-then-read-back). */
  issue(invoiceId: string): Promise<InvoiceListItemView>;
  /** Moves a draft or issued invoice to `cancelled`. Returns the updated invoice. */
  cancel(invoiceId: string): Promise<InvoiceListItemView>;
  /** Renders the invoice PDF in `locale` and opens it in the OS's default viewer. */
  print(id: string, locale: 'fr' | 'ar'): Promise<void>;
  /**
   * Renders the invoice PDF in `locale` and lets the user pick a save location.
   * `savedPath` is `null` when the save dialog was cancelled.
   */
  export(id: string, locale: 'fr' | 'ar'): Promise<{ savedPath: string | null }>;
  /** The invoice's total/net/outstanding + full payment ledger (SOU-101 history list). */
  paymentSummary(invoiceId: string): Promise<InvoicePaymentSummaryView>;
  /** Renders a single payment's receipt PDF in `locale` and opens it in the OS's default viewer. */
  printReceipt(paymentId: string, locale: 'fr' | 'ar'): Promise<void>;
  /**
   * Renders a single payment's receipt PDF in `locale` and lets the user pick a
   * save location. `savedPath` is `null` when the save dialog was cancelled.
   */
  exportReceipt(paymentId: string, locale: 'fr' | 'ar'): Promise<{ savedPath: string | null }>;
}

export const invoicesGateway: InvoicesGateway = ipcInvoicesGateway;
