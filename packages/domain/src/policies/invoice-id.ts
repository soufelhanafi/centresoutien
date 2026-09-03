import { INVOICE_ID_PREFIX, type InvoiceId } from '../entities/invoice';
import { INVOICE_LINE_ID_PREFIX, type InvoiceLineId } from '../entities/invoice-line';
import type { StudentId } from '../entities/student';
import type { FormulaId } from '../entities/formula';
import type { GroupKind } from '../entities/group';
import type { CenterCode } from '../value-objects/ids';

/**
 * Deterministic id for an `Invoice`, a pure function of the `(centerCode,
 * studentId, month)` triple that already IS the entity's one-invoice-per-
 * student-per-month invariant. Two devices generating the same student's
 * month before syncing with each other independently compute the identical
 * id, so the rows land on the ordinary optimistic-concurrency version-conflict
 * path instead of becoming two separate invoices for one billed month.
 */
export function deriveInvoiceId(
  centerCode: CenterCode,
  studentId: StudentId,
  month: string,
): InvoiceId {
  return `${INVOICE_ID_PREFIX}_${centerCode}_${studentId}_${month}` as InvoiceId;
}

/**
 * Deterministic id for an `InvoiceLine`, a pure function of `(invoiceId,
 * formulaId, kind)` — exactly the key `GenerateStudentMonthInvoice` already
 * treats as canonical when deciding whether a formula/kind is "already
 * billed" on a draft. `invoiceId` already encodes center + student + month,
 * so it is not repeated here. Making the line id this function's output means
 * two devices independently appending the same not-yet-billed line converge
 * on one row instead of double-billing the formula.
 */
export function deriveInvoiceLineId(
  invoiceId: InvoiceId,
  formulaId: FormulaId,
  kind: GroupKind,
): InvoiceLineId {
  return `${INVOICE_LINE_ID_PREFIX}_${invoiceId}_${formulaId}_${kind}` as InvoiceLineId;
}
