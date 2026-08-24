import type { InvoiceRepository } from '../ports/invoice-repository';
import type { PaymentReader } from '../ports/payment-repository';
import type { FormulaRepository } from '../ports/formula-repository';
import type { EnrollmentRepository } from '../ports/enrollment-repository';
import type { GroupRepository } from '../ports/group-repository';
import type { CenterCode } from '../value-objects/ids';
import type { TeacherId } from '../entities/teacher';
import type { StudentId } from '../entities/student';
import type { SubjectId } from '../entities/subject';
import type { Formula, FormulaId } from '../entities/formula';
import type { Invoice, InvoiceId, InvoiceSubjectAllocation } from '../entities/invoice';
import type { InvoiceLine, InvoiceLineId } from '../entities/invoice-line';
import type { StudentLineAttributionInput, SubjectTeacherAssignment } from '../policies/teacher-fee-attribution-policy';
import { collectedLineAmounts } from '../policies/collected-fees';

/**
 * Assembles a center+month's invoice lines into `TeacherFeeAttributionPolicy`
 * inputs (CLAUDE.md §6 steps 1–4) — the wiring between the raw
 * invoicing/enrollment ledger and the pure attribution policies. Extracted from
 * `MonthlyFeeAttributionService` so the two ledgers (collected vs projected)
 * share one assembly path and neither service outgrows its ceiling.
 *
 * A line's subject resolves to a teacher through the student's **live**
 * `Enrollment` in a group teaching that subject (step 3) — never attendance or
 * session data. A subject with no resolvable teacher still gets an entry with
 * `teacherId: null` so the split denominator is never narrowed (SOU-74 M1).
 */
export class AttributionLineAssembler {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly payments: PaymentReader,
    private readonly formulas: FormulaRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly groups: GroupRepository,
  ) {}

  /** Collected-ledger lines: `issued` invoices at their actually-collected portion. */
  collectCollectedLines(centerCode: CenterCode, month: string): Promise<StudentLineAttributionInput[]> {
    return this.collectLines(centerCode, month, 'collected');
  }

  /** Projected-ledger lines: every non-cancelled invoice (draft + issued) at full amount. */
  collectProjectedLines(centerCode: CenterCode, month: string): Promise<StudentLineAttributionInput[]> {
    return this.collectLines(centerCode, month, 'projected');
  }

  private async collectLines(
    centerCode: CenterCode,
    month: string,
    mode: 'collected' | 'projected',
  ): Promise<StudentLineAttributionInput[]> {
    const invoices = (await this.invoices.listByCenterMonth(centerCode, month)).filter((invoice) =>
      mode === 'collected' ? invoice.status === 'issued' : invoice.status !== 'cancelled',
    );
    if (invoices.length === 0) return [];

    const formulaById = new Map<FormulaId, Formula>(
      (await this.formulas.listAll(centerCode)).map((formula) => [formula.id, formula]),
    );

    const inputLines: StudentLineAttributionInput[] = [];
    for (const invoice of invoices) {
      const lines = await this.invoices.listLines(invoice.id);
      const amountByLine = await this.lineAmounts(invoice.id, lines, mode);

      const manualAllocation = invoice.subjectAllocation;
      if (manualAllocation !== null && manualAllocation !== undefined && manualAllocation.length > 0) {
        const invoiceWideLine = await this.buildManualAllocationLine(invoice, manualAllocation, amountByLine);
        if (invoiceWideLine !== null) inputLines.push(invoiceWideLine);
        continue;
      }

      for (const line of lines) {
        const amountMad = amountByLine.get(line.id) ?? 0;
        if (amountMad <= 0) continue;

        const formula = formulaById.get(line.formulaId);
        if (!formula) continue;

        const subjectAssignments = await this.resolveSubjectAssignments(
          invoice.studentId,
          formula.subjectIds,
          weightBySubjectForFormula(formula),
        );
        if (subjectAssignments.length === 0) continue;

        inputLines.push({ studentId: invoice.studentId, lineAmountMad: amountMad, subjectAssignments });
      }
    }
    return inputLines;
  }

  private async lineAmounts(
    invoiceId: InvoiceId,
    lines: readonly InvoiceLine[],
    mode: 'collected' | 'projected',
  ): Promise<ReadonlyMap<InvoiceLineId, number>> {
    if (mode === 'projected') {
      return new Map(lines.map((line) => [line.id, line.amountMad]));
    }
    const netPaidMad = await this.payments.sumForInvoice(invoiceId);
    return collectedLineAmounts(lines, netPaidMad);
  }

  private async buildManualAllocationLine(
    invoice: Invoice,
    allocation: readonly InvoiceSubjectAllocation[],
    amountByLine: ReadonlyMap<InvoiceLineId, number>,
  ): Promise<StudentLineAttributionInput | null> {
    const totalMad = [...amountByLine.values()].reduce((sum, amount) => sum + amount, 0);
    if (totalMad <= 0) return null;

    const subjectIds = allocation.map((entry) => entry.subjectId);
    const weightBySubject = new Map(allocation.map((entry) => [entry.subjectId, entry.amountMad]));
    const subjectAssignments = await this.resolveSubjectAssignments(
      invoice.studentId,
      subjectIds,
      weightBySubject,
    );
    if (subjectAssignments.length === 0) return null;

    return { studentId: invoice.studentId, lineAmountMad: totalMad, subjectAssignments };
  }

  private async resolveSubjectAssignments(
    studentId: StudentId,
    subjectIds: readonly SubjectId[],
    weightBySubject: ReadonlyMap<SubjectId, number>,
  ): Promise<SubjectTeacherAssignment[]> {
    const liveEnrollments = await this.enrollments.listActiveByStudent(studentId);
    const enrolledGroups = await Promise.all(
      liveEnrollments.map((enrollment) => this.groups.findById(enrollment.groupId)),
    );

    const assignments: SubjectTeacherAssignment[] = [];
    for (const subjectId of subjectIds) {
      const weightMad = weightBySubject.get(subjectId) ?? 0;
      const group = enrolledGroups.find((g) => g !== null && g.subjectId === subjectId);
      if (!group || group.teacherId === null) {
        assignments.push({ subjectId, teacherId: null, weightMad });
        continue;
      }
      // Group.teacherId is still the generic EntityId (SOU-48 predates the Teacher
      // entity, see entities/group.ts) — narrow it now that TeacherId exists.
      assignments.push({ subjectId, teacherId: group.teacherId as unknown as TeacherId, weightMad });
    }
    return assignments;
  }
}

/**
 * The per-subject weight vector for one line's weighted attribution when there is no
 * manual per-invoice override (SOU-298): the formula's own per-subject price map, else
 * an empty map — which leaves every weight `0` and lets `splitLineAmount` fall back to
 * the equal split, so an un-priced formula's payroll never changes. Amounts are used
 * only as *weights*; the policy pro-rates them to the collected amount. A manual
 * `subjectAllocation` bypasses this entirely — it is applied invoice-wide by
 * {@link AttributionLineAssembler.buildManualAllocationLine}, not per line.
 */
function weightBySubjectForFormula(formula: Formula): ReadonlyMap<SubjectId, number> {
  const weights = new Map<SubjectId, number>();
  for (const entry of formula.subjectPrices ?? []) {
    weights.set(entry.subjectId, entry.priceMad);
  }
  return weights;
}
