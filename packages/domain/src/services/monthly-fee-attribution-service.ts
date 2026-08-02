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
import {
  TeacherFeeAttributionPolicy,
  type StudentLineAttributionInput,
  type SubjectTeacherAssignment,
} from '../policies/teacher-fee-attribution-policy';
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
    const issuedInvoices = (await this.invoices.listByCenterMonth(centerCode, month)).filter(
      (invoice) => invoice.status === 'issued',
    );
    if (issuedInvoices.length === 0) return new Map();

    const formulaById = new Map<FormulaId, Formula>(
      (await this.formulas.listAll(centerCode)).map((formula) => [formula.id, formula]),
    );

    const inputLines: StudentLineAttributionInput[] = [];
    for (const invoice of issuedInvoices) {
      const lines = await this.invoices.listLines(invoice.id);
      const netPaidMad = await this.payments.sumForInvoice(invoice.id);
      const collectedByLine = collectedLineAmounts(lines, netPaidMad);

      for (const line of lines) {
        const collectedMad = collectedByLine.get(line.id) ?? 0;
        if (collectedMad <= 0) continue;

        const formula = formulaById.get(line.formulaId);
        if (!formula) continue;

        const subjectAssignments = await this.resolveSubjectAssignments(
          invoice.studentId,
          formula.subjectIds,
        );
        if (subjectAssignments.length === 0) continue;

        inputLines.push({ studentId: invoice.studentId, lineAmountMad: collectedMad, subjectAssignments });
      }
    }
    if (inputLines.length === 0) return new Map();

    const attributed = TeacherFeeAttributionPolicy.attribute(inputLines);
    return new Map(attributed.map((entry) => [entry.teacherId, entry.attributedAmountMad]));
  }

  private async resolveSubjectAssignments(
    studentId: StudentId,
    subjectIds: readonly SubjectId[],
  ): Promise<SubjectTeacherAssignment[]> {
    const liveEnrollments = await this.enrollments.listActiveByStudent(studentId);
    const enrolledGroups = await Promise.all(
      liveEnrollments.map((enrollment) => this.groups.findById(enrollment.groupId)),
    );

    const assignments: SubjectTeacherAssignment[] = [];
    for (const subjectId of subjectIds) {
      const group = enrolledGroups.find((g) => g !== null && g.subjectId === subjectId);
      if (!group || group.teacherId === null) {
        assignments.push({ subjectId, teacherId: null });
        continue;
      }
      // Group.teacherId is still the generic EntityId (SOU-48 predates the Teacher
      // entity, see entities/group.ts) — narrow it now that TeacherId exists.
      assignments.push({ subjectId, teacherId: group.teacherId as unknown as TeacherId });
    }
    return assignments;
  }
}
