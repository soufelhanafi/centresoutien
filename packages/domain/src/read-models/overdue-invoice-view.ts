import type { InvoiceId } from '../entities/invoice';
import type { StudentId } from '../entities/student';
import type { ParentId } from '../entities/parent';
import type { GroupId } from '../entities/group';

/**
 * One `issued` invoice's raw material for the Impayés (arrears) read model
 * (SOU-103): the billing month + already-derived total/net-paid (same join
 * shape as {@link InvoiceListRow}), plus the student's name, its **unresolved**
 * guardian ids, and the groups the student is currently (live) enrolled in.
 *
 * This is a **cross-aggregate read model**, not an entity: no sync envelope,
 * never persisted or written back. Produced by
 * {@link OverdueInvoiceViewReadPort}; `ListOverdueInvoices` is the one place
 * that resolves `guardianIds` to actual parent contacts, filters by derived
 * payment status / overdue-ness / amount / group, and fans a row out to every
 * guardian for the follow-up grouping.
 *
 * `studentName` is `null` only when the student row has not (yet) synced to
 * this device — soft-delete never removes it, so an archived student's name is
 * still available. `guardianIds` and `groupIds` default to an empty array in
 * that same case.
 */
export type OverdueInvoiceLineView = {
  readonly invoiceId: InvoiceId;
  readonly month: string; // 'YYYY-MM', the invoice's billing month
  readonly studentId: StudentId;
  readonly studentName: { fr: string; ar: string } | null;
  readonly guardianIds: readonly ParentId[];
  readonly groupIds: readonly GroupId[];
  readonly totalMad: number;
  readonly netPaidMad: number;
};
