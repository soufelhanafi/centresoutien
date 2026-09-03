import type { InvoiceRepository } from '../ports/invoice-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { newEnvelope } from '../entities/envelope';
import type { Invoice } from '../entities/invoice';
import type { InvoiceLine } from '../entities/invoice-line';
import { deriveInvoiceId, deriveInvoiceLineId } from '../policies/invoice-id';
import { createInvoiceDraftSchema } from '../schemas/invoice';
import { DuplicateInvoiceError } from '../errors/invoice-errors';
import type { StudentId } from '../entities/student';
import type { FormulaId } from '../entities/formula';
import type { GroupKind } from '../entities/group';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';

export type CreateInvoiceDraftInput = {
  studentId: string;
  month: string;
  lines: readonly {
    formulaId: string;
    label: { fr: string; ar: string };
    kind: GroupKind;
    amountMad: number;
  }[];
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

export type CreateInvoiceDraftResult = {
  invoice: Invoice;
  lines: readonly InvoiceLine[];
};

/**
 * Creates a monthly invoice in `draft` with its frozen line snapshots (SOU-67).
 * Gated by `core.invoicing` (every plan; the guard is still explicit so the check has
 * one home). This use case only **persists** already-computed line snapshots — the
 * generation logic that derives lines from active `StudentSubscription`s + `Formula`s
 * (SOU-60/63) is a separate ticket and lives elsewhere; keeping it out here is why
 * the line carries a soft `formulaId` ref rather than depending on the Formula entity.
 *
 * Order of work:
 *  1. Gate on `core.invoicing`.
 *  2. Validate the user-derivable fields with `createInvoiceDraftSchema` (month shape,
 *     ≥ 1 line, per-line snapshot shape).
 *  3. Enforce one-invoice-per-student-per-month: if a **live** invoice already exists
 *     for `(centerCode, studentId, month)`, throw {@link DuplicateInvoiceError}. The
 *     lookup is center-scoped in the query, not a post-filter. This is the domain
 *     idempotency guard (no DB unique index, so concurrent same-month creates converge
 *     on sync-resolve, CLAUDE.md §5bis) — guaranteed, not just aspirational, because
 *     the invoice's id is itself `deriveInvoiceId(centerCode, studentId, month)`: two
 *     devices racing to create the same student-month independently compute the same
 *     id, so the second push lands on the ordinary version-conflict retry path rather
 *     than creating a second row.
 *  4. Build the `draft` header and one {@link InvoiceLine} per snapshot, each with its
 *     own fresh envelope and a `deriveInvoiceLineId(invoiceId, formulaId, kind)` id
 *     (the same convergence guarantee, one level down), and persist them in one
 *     transaction via `createDraft`.
 *
 * A fresh draft is always born `status: 'draft'`, `issuedAt`/`cancelledAt` null,
 * `version` 0, alive — the caller cannot smuggle a lifecycle state in.
 */
export class CreateInvoiceDraft {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CreateInvoiceDraftInput): Promise<CreateInvoiceDraftResult> {
    this.plan.require('core.invoicing');
    const fields = createInvoiceDraftSchema.parse(input);

    const studentId = fields.studentId as StudentId;
    const existing = await this.invoices.findByStudentMonth(
      input.centerCode,
      studentId,
      fields.month,
    );
    if (existing !== null) {
      throw new DuplicateInvoiceError(studentId, fields.month);
    }

    const invoiceId = deriveInvoiceId(input.centerCode, studentId, fields.month);
    const invoice: Invoice = {
      id: invoiceId,
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      studentId,
      month: fields.month,
      status: 'draft',
      issuedAt: null,
      cancelledAt: null,
      subjectAllocation: null,
    };

    const lines: InvoiceLine[] = fields.lines.map((snapshot) => ({
      id: deriveInvoiceLineId(invoiceId, snapshot.formulaId as FormulaId, snapshot.kind),
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      invoiceId,
      formulaId: snapshot.formulaId as FormulaId,
      label: snapshot.label,
      kind: snapshot.kind,
      amountMad: snapshot.amountMad,
    }));

    await this.invoices.createDraft(invoice, lines);
    return { invoice, lines };
  }
}
