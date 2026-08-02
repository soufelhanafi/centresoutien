import type { RecordPaymentFields } from '@centresoutien/domain';
import type { InvoiceListFilters, InvoiceListItemView } from './invoice-view';
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
  /** Renders the invoice PDF in `locale` and opens it in the OS's default viewer. */
  print(id: string, locale: 'fr' | 'ar'): Promise<void>;
  /**
   * Renders the invoice PDF in `locale` and lets the user pick a save location.
   * `savedPath` is `null` when the save dialog was cancelled.
   */
  export(id: string, locale: 'fr' | 'ar'): Promise<{ savedPath: string | null }>;
}

export const invoicesGateway: InvoicesGateway = ipcInvoicesGateway;
