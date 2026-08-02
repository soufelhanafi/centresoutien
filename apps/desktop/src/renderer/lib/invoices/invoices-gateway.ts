import type { RecordPaymentFields } from '@centresoutien/domain';
import type { InvoiceListFilters, InvoiceListItemView } from './invoice-view';
import { mockInvoicesGateway } from './mock-invoices-gateway';

/** A direct alias of the domain's own `recordPaymentSchema` shape (already shipped, SOU-93). */
export type RecordPaymentInput = RecordPaymentFields;

/**
 * The seam the Invoice UI depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is
 * swappable in one place with no change to any component.
 *
 * ## Contract status (SOU-69 frontend ↔ domain-backend)
 *
 * Not yet published: `invoice.list` / `invoice.get` / `invoice.print` /
 * `invoice.export` IPC channels and the pdf-lib adapter behind `print`/`export`.
 * This ships against the in-memory {@link mockInvoicesGateway} so the list,
 * detail, print/export, and mark-paid flows are fully wired and exercisable.
 * `recordPayment` takes the exact `recordPaymentSchema` shape the real
 * `payment.record` channel already accepts (SOU-93 is shipped) — once
 * `invoice.list`/`invoice.get` land, `recordPayment` swaps to call
 * `payment.record` + `payment.summary` with no change to callers.
 */
export interface InvoicesGateway {
  list(filters: InvoiceListFilters): Promise<readonly InvoiceListItemView[]>;
  get(id: string): Promise<InvoiceListItemView | null>;
  recordPayment(input: RecordPaymentInput): Promise<InvoiceListItemView>;
  /** Opens the generated PDF in the OS print dialog. */
  print(id: string): Promise<void>;
  /** Saves the generated PDF under `destinationDir`, returning the written path. */
  export(id: string, destinationDir: string): Promise<{ filePath: string }>;
}

/** The active gateway. Swap to `ipcInvoicesGateway` once SOU-69 domain publishes the channels. */
export const invoicesGateway: InvoicesGateway = mockInvoicesGateway;
