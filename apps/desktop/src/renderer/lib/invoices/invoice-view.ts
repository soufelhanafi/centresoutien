import type { GroupKind, InvoiceStatus, PaymentStatus } from '@centresoutien/domain';
import type { InvoiceSubjectAllocationDto } from '../../../shared/ipc/contract';

export type { InvoiceStatus, PaymentStatus };

/**
 * One subject's amount in an invoice's manual attribution override (SOU-298) —
 * a direct alias of the boundary DTO, so the renderer shape can never drift from
 * what `invoice.setAllocation` accepts and returns. The domain reads these as a
 * weight vector; they need not sum to the invoice total.
 */
export type InvoiceSubjectAllocation = InvoiceSubjectAllocationDto;

/** One frozen billing line, mirroring the domain's `InvoiceLine` snapshot fields. */
export type InvoiceLineView = {
  readonly id: string;
  readonly formulaId: string;
  readonly label: { readonly fr: string; readonly ar: string };
  readonly kind: GroupKind;
  readonly amountMad: number;
};

/**
 * One invoice for the list + detail screens (SOU-69). `status` is the stored
 * lifecycle (draft/issued/cancelled); `paymentStatus` is the derived
 * unpaid/partially-paid/paid dimension — the two are intentionally separate
 * fields here (the domain's `InvoiceListItem` names the derived one `status`,
 * which this view avoids to keep both dimensions readable at once).
 */
export type InvoiceListItemView = {
  readonly id: string;
  readonly studentId: string;
  /**
   * The invoice's student's bilingual name, resolved server-side (SOU-200) so the
   * cash-desk picker labels rows without a separate full-student-list fetch.
   * Optional on the wire; the main-process handler always populates it (empty
   * `{ fr:'', ar:'' }` only until the student row has synced).
   */
  readonly studentName?: { readonly fr: string; readonly ar: string } | undefined;
  readonly month: string;
  readonly status: InvoiceStatus;
  readonly issuedAt: string | null;
  readonly lines: readonly InvoiceLineView[];
  readonly totalMad: number;
  readonly netPaidMad: number;
  readonly outstandingMad: number;
  readonly paymentStatus: PaymentStatus;
  /**
   * The director's manual per-subject attribution override (SOU-298), or `null`
   * for the weighted default (Option A). `undefined` on pre-existing fixtures
   * that predate the field; both absent forms mean "weighted".
   */
  readonly subjectAllocation?: readonly InvoiceSubjectAllocation[] | null | undefined;
};

/** Structural + derived filters for the list screen. An empty object lists everything. */
export type InvoiceListFilters = {
  readonly month?: string;
  readonly studentId?: string;
  readonly paymentStatus?: PaymentStatus;
};

/**
 * One bounded page of the cash-desk "open invoices" read (SOU-200): the
 * still-owes-money set (`openOnly`, SQL-applied) filtered by student name and
 * keyset-paginated. `cursor` is the previous page's `nextCursor`; omit it for
 * the first page.
 */
export type OpenInvoicesQuery = {
  readonly search?: string;
  readonly cursor?: string;
  readonly pageSize?: number;
};

/** A page of open invoices plus the keyset cursor to fetch the next one (`null` = last page). */
export type OpenInvoicesPage = {
  readonly invoices: readonly InvoiceListItemView[];
  readonly nextCursor: string | null;
};
