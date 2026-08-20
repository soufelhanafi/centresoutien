import type { InvoiceLine } from '../entities/invoice-line';
import type { InvoiceId, InvoiceStatus } from '../entities/invoice';
import type { StudentId } from '../entities/student';
import type { ParentId } from '../entities/parent';
import type { PaymentStatus } from '../policies/payment-status';

/**
 * One child's block on the consolidated per-parent statement (SOU-284). Each block
 * is a projection of that child's single underlying monthly {@link Invoice} — the
 * per-student invoice stays the source of truth; this is a derived read row, never
 * a stored document.
 *
 * A child with no invoice for the month is still present (never omitted): `invoiceId`
 * / `invoiceStatus` are `null`, the line arrays are empty, and every money field is
 * `0`. The renderer maps the `null` `invoiceId` to the « Aucune facture » section.
 *
 * `invoiceStatus` is the invoice lifecycle (draft/issued/cancelled), kept so the
 * renderer can badge a cancelled child block; `childStatus` is the **derived**
 * payment status from the append-only ledger (`paymentStatusOf`), never stored.
 */
export type ParentStatementChild = {
  readonly childId: StudentId;
  readonly childName: { fr: string; ar: string };
  /** `null` → this child has no invoice this month (« Aucune facture »). */
  readonly invoiceId: InvoiceId | null;
  readonly invoiceStatus: InvoiceStatus | null;
  readonly regularLines: readonly InvoiceLine[];
  readonly examPrepLines: readonly InvoiceLine[];
  readonly regularSubtotalMad: number;
  readonly examPrepSubtotalMad: number;
  readonly childTotalMad: number;
  readonly childNetPaidMad: number;
  /** `max(0, childTotal − childNetPaid)` — never negative. */
  readonly childOutstandingMad: number;
  readonly childStatus: PaymentStatus;
};

/**
 * The consolidated monthly statement for one guardian — the **Facture groupée**
 * read model (SOU-284). A single document over all a guardian's live children in
 * this center: one block per child (each carrying that child's own invoice number
 * so per-child fiscal records stay traceable), then one grand-total block.
 *
 * It is a **pure derived read model**: there is no stored "parent invoice", no
 * persisted total, and no separate statement number. The grand total / total
 * received / outstanding are the sums across children, and `aggregateStatus`
 * follows from the summed outstanding balance (see `aggregateParentStatement`) —
 * all computed at read time from the children's per-invoice derived state.
 *
 * Cross-aggregate read model, not an entity: no sync envelope, never persisted.
 * Center-scoped — only children of `parentId` in the same `centerCode` are included.
 */
export type ParentMonthlyStatementView = {
  readonly parentId: ParentId;
  /** The responsible guardian's name — the statement header's addressee. */
  readonly parentName: string;
  readonly month: string; // 'YYYY-MM'
  readonly perChild: readonly ParentStatementChild[];
  readonly grandTotalMad: number;
  readonly totalReceivedMad: number;
  /** Sum of each child's clamped outstanding — an overpayment on one child never
   *  masks another child's debt. */
  readonly outstandingMad: number;
  readonly aggregateStatus: PaymentStatus;
};
