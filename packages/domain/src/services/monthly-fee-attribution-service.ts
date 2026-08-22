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
import type { Invoice, InvoiceSubjectAllocation } from '../entities/invoice';
import type { InvoiceLineId } from '../entities/invoice-line';
import {
  TeacherFeeAttributionPolicy,
  type StudentLineAttributionInput,
  type SubjectTeacherAssignment,
} from '../policies/teacher-fee-attribution-policy';
import { SubjectRevenueAttributionPolicy } from '../policies/subject-revenue-attribution-policy';
import { collectedLineAmounts } from '../policies/collected-fees';

/**
 * Assembles a center+month's collected invoice lines into
 * `TeacherFeeAttributionPolicy` inputs, then attributes them — the wiring
 * CLAUDE.md §6 steps 1–4 describe between the raw invoicing/enrollment ledger
 * and the pure equal-split policy (SOU-73). Only `issued` invoices are read
 * (`draft` and `cancelled` are excluded, step 4); an `unpaid` issued invoice
 * contributes zero via `collectedLineAmounts`, so no separate branch is needed
 * for it either.
 *
 * A line's subject resolves to a teacher through the student's **live**
 * `Enrollment` in a group teaching that subject (step 3) — never attendance or
 * session data, which this reads path never touches, keeping payroll
 * independent of whether a session actually happened. A subject with no
 * resolvable teacher (no matching live enrollment, or a group with no teacher
 * assigned yet) still gets an entry in that line's `subjectAssignments`, with
 * `teacherId: null` — CLAUDE.md §6 step 2 splits equally across the formula's
 * subjects, full stop, so an unstaffed subject's share stays unattributed
 * rather than being redistributed onto whichever subjects happen to be
 * staffed (SOU-74 M1: redistribution would silently inflate a staffed
 * teacher's payout on a partially-staffed formula). A line with zero subjects
 * at all (a formula with an empty `subjectIds`, which should never happen) is
 * skipped entirely rather than passed to the policy as an empty line.
 */
export class MonthlyFeeAttributionService {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly payments: PaymentReader,
    private readonly formulas: FormulaRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly groups: GroupRepository,
  ) {}

  async attributedAmountsByTeacher(
    centerCode: CenterCode,
    month: string,
  ): Promise<ReadonlyMap<TeacherId, number>> {
    const inputLines = await this.collectAttributionLines(centerCode, month);
    if (inputLines.length === 0) return new Map();

    const attributed = TeacherFeeAttributionPolicy.attribute(inputLines);
    return new Map(attributed.map((entry) => [entry.teacherId, entry.attributedAmountMad]));
  }

  /**
   * Same collected-fee lines as {@link attributedAmountsByTeacher}, grouped by
   * subject instead of teacher (SOU-100's per-subject revenue widget) — reuses
   * the identical assembly so the two views of one month's collected money can
   * never drift apart.
   */
  async attributedAmountsBySubject(
    centerCode: CenterCode,
    month: string,
  ): Promise<ReadonlyMap<SubjectId, number>> {
    const inputLines = await this.collectAttributionLines(centerCode, month);
    if (inputLines.length === 0) return new Map();

    const attributed = SubjectRevenueAttributionPolicy.attribute(inputLines);
    return new Map(attributed.map((entry) => [entry.subjectId, entry.attributedAmountMad]));
  }

  /**
   * Same attribution base as `attributedAmountsByTeacher`, broken out by
   * subject — the payroll dashboard drill-down (SOU-76): "which subjects made
   * up this teacher's figure this month". A teacher with no attributable fees
   * that month is simply absent from the outer map, mirroring
   * `attributedAmountsByTeacher`'s empty-map convention.
   */
  async attributedAmountsByTeacherAndSubject(
    centerCode: CenterCode,
    month: string,
  ): Promise<ReadonlyMap<TeacherId, ReadonlyMap<SubjectId, number>>> {
    const inputLines = await this.collectAttributionLines(centerCode, month);
    if (inputLines.length === 0) return new Map();

    const attributed = TeacherFeeAttributionPolicy.attributeBySubject(inputLines);
    const byTeacher = new Map<TeacherId, Map<SubjectId, number>>();
    for (const entry of attributed) {
      const bySubject = byTeacher.get(entry.teacherId) ?? new Map<SubjectId, number>();
      bySubject.set(entry.subjectId, entry.attributedAmountMad);
      byTeacher.set(entry.teacherId, bySubject);
    }
    return byTeacher;
  }

  /**
   * Assembles a center+month's collected invoice lines into
   * `TeacherFeeAttributionPolicy` inputs (CLAUDE.md §6 steps 1–4): only
   * `issued` invoices, only their actually-collected portion, each subject on
   * the formula resolved to the teacher of the group the student attended for
   * it (or `null` if unresolved). Shared by every attribution view so there is
   * exactly one place this wiring lives.
   */
  private async collectAttributionLines(
    centerCode: CenterCode,
    month: string,
  ): Promise<StudentLineAttributionInput[]> {
    const issuedInvoices = (await this.invoices.listByCenterMonth(centerCode, month)).filter(
      (invoice) => invoice.status === 'issued',
    );
    if (issuedInvoices.length === 0) return [];

    const formulaById = new Map<FormulaId, Formula>(
      (await this.formulas.listAll(centerCode)).map((formula) => [formula.id, formula]),
    );

    const inputLines: StudentLineAttributionInput[] = [];
    for (const invoice of issuedInvoices) {
      const lines = await this.invoices.listLines(invoice.id);
      const netPaidMad = await this.payments.sumForInvoice(invoice.id);
      const collectedByLine = collectedLineAmounts(lines, netPaidMad);

      const manualAllocation = invoice.subjectAllocation;
      if (manualAllocation !== null && manualAllocation !== undefined && manualAllocation.length > 0) {
        const invoiceWideLine = await this.buildManualAllocationLine(
          invoice,
          manualAllocation,
          collectedByLine,
        );
        if (invoiceWideLine !== null) inputLines.push(invoiceWideLine);
        continue;
      }

      for (const line of lines) {
        const collectedMad = collectedByLine.get(line.id) ?? 0;
        if (collectedMad <= 0) continue;

        const formula = formulaById.get(line.formulaId);
        if (!formula) continue;

        const weightBySubject = weightBySubjectForFormula(formula);
        const subjectAssignments = await this.resolveSubjectAssignments(
          invoice.studentId,
          formula.subjectIds,
          weightBySubject,
        );
        if (subjectAssignments.length === 0) continue;

        inputLines.push({ studentId: invoice.studentId, lineAmountMad: collectedMad, subjectAssignments });
      }
    }
    return inputLines;
  }

  /**
   * A manual per-invoice `subjectAllocation` is an INVOICE-WIDE split (SOU-298), not a
   * per-line one: the director's weight vector apportions the invoice's TOTAL collected
   * amount across its subjects, then each subject resolves to its teacher via the (one)
   * student's live enrollment. Applying the vector per line — restricted to that line's
   * formula subjects — would produce the wrong aggregate on a multi-line invoice, since
   * a subject absent from a line would forfeit its intended share of that line.
   */
  private async buildManualAllocationLine(
    invoice: Invoice,
    allocation: readonly InvoiceSubjectAllocation[],
    collectedByLine: ReadonlyMap<InvoiceLineId, number>,
  ): Promise<StudentLineAttributionInput | null> {
    const totalCollectedMad = [...collectedByLine.values()].reduce((sum, amount) => sum + amount, 0);
    if (totalCollectedMad <= 0) return null;

    const subjectIds = allocation.map((entry) => entry.subjectId);
    const weightBySubject = new Map(allocation.map((entry) => [entry.subjectId, entry.amountMad]));
    const subjectAssignments = await this.resolveSubjectAssignments(
      invoice.studentId,
      subjectIds,
      weightBySubject,
    );
    if (subjectAssignments.length === 0) return null;

    return { studentId: invoice.studentId, lineAmountMad: totalCollectedMad, subjectAssignments };
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
 * {@link MonthlyFeeAttributionService.buildManualAllocationLine}, not per line.
 */
function weightBySubjectForFormula(formula: Formula): ReadonlyMap<SubjectId, number> {
  const weights = new Map<SubjectId, number>();
  for (const entry of formula.subjectPrices ?? []) {
    weights.set(entry.subjectId, entry.priceMad);
  }
  return weights;
}
