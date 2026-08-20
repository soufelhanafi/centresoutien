import type { InvoiceRepository } from '../ports/invoice-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CreateInvoiceDraft } from './create-invoice-draft';
import { newEnvelope } from '../entities/envelope';
import type { Invoice, InvoiceId } from '../entities/invoice';
import {
  INVOICE_LINE_ID_PREFIX,
  type InvoiceLine,
  type InvoiceLineId,
} from '../entities/invoice-line';
import { createInvoiceDraftSchema, type InvoiceLineSnapshot } from '../schemas/invoice';
import { DuplicateInvoiceError } from '../errors/invoice-errors';
import type { StudentId } from '../entities/student';
import type { FormulaId } from '../entities/formula';
import type { GroupKind } from '../entities/group';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';

export type GenerateStudentMonthInvoiceInput = {
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

/**
 * What happened to the student's invoice for the month (SOU-289):
 *  - `created` — no live invoice existed; a fresh draft was created with the lines.
 *  - `line-appended` — a live **draft** existed; the not-yet-billed lines were
 *    appended to it (never a second invoice).
 *  - `already-billed` — a live draft existed and every requested `(formulaId, kind)`
 *    was already on it; nothing was written (idempotent re-run).
 *  - `issued-skipped` — a live non-draft invoice (issued or cancelled) exists; its
 *    lines are frozen, so nothing was touched. The caller surfaces this to the
 *    director for a manual follow-up.
 */
export const STUDENT_MONTH_INVOICE_OUTCOMES = [
  'created',
  'line-appended',
  'already-billed',
  'issued-skipped',
] as const;
export type StudentMonthInvoiceOutcome = (typeof STUDENT_MONTH_INVOICE_OUTCOMES)[number];

export type GenerateStudentMonthInvoiceResult = {
  outcome: StudentMonthInvoiceOutcome;
  invoiceId: InvoiceId;
};

/**
 * The single per-student draft-generation path (SOU-289) — the shared unit behind
 * both the monthly batch (`GenerateMonthlyInvoices`) and the on-enrollment hook
 * (`CreateStudentSubscription`), so both converge on the exact same dedup key:
 * `findByStudentMonth` + `CreateInvoiceDraft`'s one-invoice-per-student-per-month
 * guard. Gated by `core.invoicing`.
 *
 * Callers hand in already-derived line snapshots (formula label/price resolution
 * stays with them — the batch resolves from one prefetched formula map, the
 * enrollment hook from a single formula read), and this use case decides create vs
 * append vs no-op:
 *
 *  1. No live invoice for `(centerCode, studentId, month)` → delegate to
 *     `CreateInvoiceDraft` (whose own guard re-checks the key) → `created`. If that
 *     guard throws {@link DuplicateInvoiceError} — a concurrent generator won the
 *     race between our read and the delegate's — the invoice is re-fetched once and
 *     handled through steps 2/3 exactly as if it had existed from the start. One
 *     retry, no loop: the second fetch cannot lose the same race twice.
 *  2. Live **draft** → append one fresh-envelope line per snapshot whose
 *     `(formulaId, kind)` is not already billed on it; all present → `already-billed`,
 *     otherwise `line-appended`.
 *  3. Live `issued` **or `cancelled`** → touch nothing → `issued-skipped`. A
 *     cancelled month was closed by a human on purpose; silently resurrecting
 *     billing on it would undo that decision, so it is treated exactly like the
 *     issued freeze and left to the director.
 */
export class GenerateStudentMonthInvoice {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly createInvoiceDraft: Pick<CreateInvoiceDraft, 'execute'>,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GenerateStudentMonthInvoiceInput): Promise<GenerateStudentMonthInvoiceResult> {
    this.plan.require('core.invoicing');
    const fields = createInvoiceDraftSchema.parse(input);

    const existing = await this.invoices.findByStudentMonth(
      input.centerCode,
      fields.studentId as StudentId,
      fields.month,
    );
    if (existing === null) {
      try {
        const { invoice } = await this.createInvoiceDraft.execute(input);
        return { outcome: 'created', invoiceId: invoice.id };
      } catch (error) {
        if (!(error instanceof DuplicateInvoiceError)) throw error;
        const racedInvoice = await this.invoices.findByStudentMonth(
          input.centerCode,
          fields.studentId as StudentId,
          fields.month,
        );
        if (racedInvoice === null) throw error;
        return this.convergeOnExisting(racedInvoice, fields.lines, input);
      }
    }
    return this.convergeOnExisting(existing, fields.lines, input);
  }

  private async convergeOnExisting(
    existing: Invoice,
    snapshots: readonly InvoiceLineSnapshot[],
    input: GenerateStudentMonthInvoiceInput,
  ): Promise<GenerateStudentMonthInvoiceResult> {
    if (existing.status !== 'draft') {
      return { outcome: 'issued-skipped', invoiceId: existing.id };
    }

    const missing = await this.snapshotsNotYetBilled(existing.id, snapshots);
    if (missing.length === 0) {
      return { outcome: 'already-billed', invoiceId: existing.id };
    }

    await this.invoices.appendLinesToDraft(
      existing.id,
      missing.map((snapshot) => this.buildLine(existing, snapshot, input)),
    );
    return { outcome: 'line-appended', invoiceId: existing.id };
  }

  private async snapshotsNotYetBilled(
    invoiceId: InvoiceId,
    snapshots: readonly InvoiceLineSnapshot[],
  ): Promise<readonly InvoiceLineSnapshot[]> {
    const billed = await this.invoices.listLines(invoiceId);
    return snapshots.filter(
      (snapshot) =>
        !billed.some((line) => line.formulaId === snapshot.formulaId && line.kind === snapshot.kind),
    );
  }

  private buildLine(
    invoice: Invoice,
    snapshot: InvoiceLineSnapshot,
    input: GenerateStudentMonthInvoiceInput,
  ): InvoiceLine {
    return {
      id: this.ids.next(INVOICE_LINE_ID_PREFIX) as InvoiceLineId,
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      invoiceId: invoice.id,
      formulaId: snapshot.formulaId as FormulaId,
      label: snapshot.label,
      kind: snapshot.kind,
      amountMad: snapshot.amountMad,
    };
  }
}
