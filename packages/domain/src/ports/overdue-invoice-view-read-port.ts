import type { OverdueInvoiceLineView } from '../read-models/overdue-invoice-view';
import type { CenterCode } from '../value-objects/ids';

/**
 * Read port for the Impayés (arrears) screen's raw material (SOU-103). Separate
 * from {@link InvoiceRepository} the same way {@link WeeklySessionViewReadPort}
 * is separate from `WeeklyRecurringSessionRepository`: that port persists the
 * invoice aggregate, whereas this one serves a **denormalized cross-aggregate
 * read** (invoice ⋈ invoice_lines ⋈ payments ⋈ student ⋈ enrollments). The
 * SQLite adapter that owns `invoices` implements this port too, because the
 * join is anchored on that table — one class, several ports.
 */
export interface OverdueInvoiceViewReadPort {
  /**
   * Every live `issued` invoice of the center as the enriched
   * {@link OverdueInvoiceLineView} `ListOverdueInvoices` resolves into the
   * Impayés list. Draft and cancelled invoices are excluded — only an issued
   * invoice is a real, collectible debt. Deliberately NOT filtered to
   * unpaid/overdue here: the derived payment status needs the same formula
   * every other invoice screen uses, and "overdue" needs `Clock.now()`, which
   * a read port has no business reading — both filters are
   * `ListOverdueInvoices`' job, so the two screens can never disagree on what
   * counts as arrears.
   */
  listIssuedInvoiceLines(centerCode: CenterCode): Promise<readonly OverdueInvoiceLineView[]>;
}
