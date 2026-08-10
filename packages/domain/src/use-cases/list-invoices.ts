import type { InvoiceRepository } from '../ports/invoice-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { Invoice, InvoiceId } from '../entities/invoice';
import type { InvoiceLine } from '../entities/invoice-line';
import type { StudentId } from '../entities/student';
import { paymentStatusOf, type PaymentStatus } from '../policies/payment-status';
import type { CenterCode } from '../value-objects/ids';

export type ListInvoicesInput = {
  centerCode: CenterCode;
  month?: string;
  studentId?: StudentId;
  invoiceId?: InvoiceId;
  /** The derived payment status (unpaid/partially-paid/paid) — NOT the lifecycle
   *  `status` on {@link Invoice}. Applied in-memory once totals are known. */
  paymentStatus?: PaymentStatus;
  /** `status !== 'cancelled' && outstandingMad > 0` — the cash-desk payment
   *  picker's "still owes" set (SOU-200). Applied in SQL by the adapter. */
  openOnly?: boolean;
  /** Case-insensitive substring over the student's `fr`/`ar` name (SOU-200). */
  search?: string;
  /** Keyset cursor for the next page (exclusive upper-bound invoice id). */
  cursor?: string;
  /** Bounded page size; when set, the read is paginated and returns a `nextCursor`. */
  pageSize?: number;
};

export type InvoiceListItem = {
  invoice: Invoice;
  /** The invoice's student's bilingual name, resolved in the read row's join —
   *  lets the picker label rows without a separate full-student-list fetch. */
  studentName: { fr: string; ar: string };
  lines: readonly InvoiceLine[];
  totalMad: number;
  netPaidMad: number;
  /** `max(0, total − netPaid)` — never negative, so overpayment reads as 0 owed. */
  outstandingMad: number;
  status: PaymentStatus;
};

/** One page of resolved invoice rows plus the keyset cursor to fetch the next one
 *  (`null` when this was the last page or the read was unpaginated). */
export type ListInvoicesResult = {
  items: readonly InvoiceListItem[];
  nextCursor: string | null;
};

/**
 * The invoice list + detail read model (SOU-69): every live invoice matching the
 * structural filters (`month` / `studentId` / `invoiceId`), each resolved to its
 * lines, total, net paid, outstanding, and **derived** payment status — one call
 * serves both the filterable list screen and a single-invoice detail fetch (pass
 * `invoiceId`). Cancelled invoices are included and lifecycle-badged, never hidden.
 *
 * `paymentStatus` is the one filter the repository cannot apply in SQL without
 * duplicating the status formula there — it is derived via the same
 * {@link paymentStatusOf} the rest of the domain uses (`GetInvoicePaymentSummary`),
 * applied here in-memory so there is exactly one place that formula lives.
 *
 * Gated by `core.invoicing` (every plan).
 */
export class ListInvoices {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListInvoicesInput): Promise<ListInvoicesResult> {
    this.plan.require('core.invoicing');

    const page = await this.invoices.listInvoices(input.centerCode, {
      ...(input.month !== undefined && { month: input.month }),
      ...(input.studentId !== undefined && { studentId: input.studentId }),
      ...(input.invoiceId !== undefined && { invoiceId: input.invoiceId }),
      ...(input.openOnly !== undefined && { openOnly: input.openOnly }),
      ...(input.search !== undefined && { search: input.search }),
      ...(input.cursor !== undefined && { cursor: input.cursor }),
      ...(input.pageSize !== undefined && { pageSize: input.pageSize }),
    });

    const items = page.rows.map((row) => {
      const outstandingMad = Math.max(0, row.totalMad - row.netPaidMad);
      return {
        invoice: row.invoice,
        studentName: row.studentName,
        lines: row.lines,
        totalMad: row.totalMad,
        netPaidMad: row.netPaidMad,
        outstandingMad,
        status: paymentStatusOf(row.totalMad, row.netPaidMad),
      };
    });

    const filtered =
      input.paymentStatus === undefined
        ? items
        : items.filter((item) => item.status === input.paymentStatus);

    return { items: filtered, nextCursor: page.nextCursor };
  }
}
