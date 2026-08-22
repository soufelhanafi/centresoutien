import type { InvoiceRepository } from '../ports/invoice-repository';
import type { FormulaRepository } from '../ports/formula-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { applyWrite } from '../entities/write';
import { invoiceAllocationInputSchema, type InvoiceAllocationInput } from '../schemas/invoice-allocation';
import { InvalidInvoiceAllocationError, InvoiceNotFoundError } from '../errors/invoice-errors';
import type { Invoice, InvoiceId, InvoiceSubjectAllocation } from '../entities/invoice';
import type { SubjectId } from '../entities/subject';
import type { CenterCode, UserId } from '../value-objects/ids';

export type SetInvoiceSubjectAllocationInput = InvoiceAllocationInput & {
  centerCode: CenterCode;
  invoiceId: InvoiceId;
  updatedBy: UserId;
};

/**
 * Pins (or clears) a manual per-subject attribution split on one invoice (SOU-298).
 * A non-null `allocations` map overrides the formula-price-weighted attribution for
 * this invoice; `allocations: null` clears it back to the weighted default. Gated by
 * `payroll.teacher` — the split only matters for percentage-of-fees payroll.
 *
 * The override is a weight vector, not a money movement: it is deliberately NOT
 * required to sum to the invoice total, it never touches the append-only Payment
 * ledger, and it never changes the billed line amounts. It is applied to any live
 * invoice (a cancelled one simply never contributes to attribution). Cross-field
 * validation the pure schema cannot express — no duplicate subject, not every amount
 * zero, and every subject actually covered by one of the invoice's line formulas —
 * raises {@link InvalidInvoiceAllocationError}. The last check (`unknown-subject`)
 * closes the silent no-op: a subject on no line formula is ignored at attribution, so
 * without it a saved override could carry no effect. The per-amount check (each
 * `amountMad` a non-negative integer, the `invalid-amount` reason) is owned by
 * `invoiceAllocationInputSchema` and rejected before this use case runs, so it never
 * surfaces from here. The target is center-scoped: an unknown/discarded/foreign id
 * raises {@link InvoiceNotFoundError}.
 */
export class SetInvoiceSubjectAllocation {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly formulas: FormulaRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: SetInvoiceSubjectAllocationInput): Promise<Invoice> {
    this.plan.require('payroll.teacher');
    const fields = invoiceAllocationInputSchema.parse(input);

    const existing = await this.invoices.findById(input.invoiceId);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new InvoiceNotFoundError(input.invoiceId);
    }

    const allocation =
      fields.allocations === null
        ? null
        : await this.validateAllocations(fields.allocations, existing.id);

    const { next } = applyWrite(
      existing,
      { subjectAllocation: allocation },
      { clock: this.clock, updatedBy: input.updatedBy },
    );
    await this.invoices.save(next);
    return next;
  }

  private async validateAllocations(
    allocations: InvoiceAllocationInput['allocations'] & object,
    invoiceId: InvoiceId,
  ): Promise<readonly InvoiceSubjectAllocation[]> {
    const seen = new Set<string>();
    let total = 0;
    for (const entry of allocations) {
      if (seen.has(entry.subjectId)) {
        throw new InvalidInvoiceAllocationError('duplicate-subject');
      }
      seen.add(entry.subjectId);
      total += entry.amountMad;
    }
    if (total <= 0) {
      throw new InvalidInvoiceAllocationError('all-zero');
    }

    const coveredSubjectIds = await this.coveredSubjectIds(invoiceId);
    for (const entry of allocations) {
      if (!coveredSubjectIds.has(entry.subjectId as SubjectId)) {
        throw new InvalidInvoiceAllocationError('unknown-subject');
      }
    }

    return allocations.map((entry) => ({ subjectId: entry.subjectId as SubjectId, amountMad: entry.amountMad }));
  }

  private async coveredSubjectIds(invoiceId: InvoiceId): Promise<ReadonlySet<SubjectId>> {
    const lines = await this.invoices.listLines(invoiceId);
    const covered = new Set<SubjectId>();
    for (const line of lines) {
      const formula = await this.formulas.findById(line.formulaId);
      if (formula === null) continue;
      for (const subjectId of formula.subjectIds) {
        covered.add(subjectId);
      }
    }
    return covered;
  }
}
