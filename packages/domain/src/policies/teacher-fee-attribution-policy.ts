import type { SubjectId } from '../entities/subject';
import type { TeacherId } from '../entities/teacher';
import type { StudentId } from '../entities/student';
import { EmptyAttributionLineError } from '../errors/payroll-errors';

/** One subject on a billed line, paired with the teacher who taught it to this student that month. */
export type SubjectTeacherAssignment = {
  readonly subjectId: SubjectId;
  readonly teacherId: TeacherId;
};

/**
 * One student's collected invoice line for the month, reduced to exactly what
 * equal-split attribution needs. `lineAmountMad` is already the caller's
 * concern to have filtered to fees actually collected (CLAUDE.md §6 step 4);
 * `subjectAssignments` is already resolved to one entry per subject on the
 * line, each carrying the teacher of the group the student attended for that
 * subject (SOU-73 KICKOFF) — this policy never touches Enrollment/Group/Payment
 * repositories itself.
 */
export type StudentLineAttributionInput = {
  readonly studentId: StudentId;
  readonly lineAmountMad: number;
  readonly subjectAssignments: readonly SubjectTeacherAssignment[];
};

/** A teacher's monthly attribution base — the input to `percentage-of-monthly-fees` payouts. */
export type TeacherAttributedAmount = {
  readonly teacherId: TeacherId;
  readonly attributedAmountMad: number;
};

/**
 * Splits `amountMad` into `count` shares that are equal to the centime and sum
 * back to `amountMad` exactly — the largest-remainder method. Every share gets
 * `floor(amountMad / count)`; the leftover centimes (`amountMad % count`) go
 * one each to the first shares in assignment order, so the split is
 * deterministic for a given line.
 */
function splitLineAmount(
  line: StudentLineAttributionInput,
): readonly { readonly teacherId: TeacherId; readonly shareMad: number }[] {
  const count = line.subjectAssignments.length;
  const base = Math.floor(line.lineAmountMad / count);
  const remainder = line.lineAmountMad - base * count;
  return line.subjectAssignments.map((assignment, index) => ({
    teacherId: assignment.teacherId,
    shareMad: base + (index < remainder ? 1 : 0),
  }));
}

/**
 * Equal-split teacher fee attribution (CLAUDE.md §6). For each student's
 * collected invoice line, splits the amount equally across its N subjects,
 * then sums each subject's share into the teacher who taught it — across all
 * students and all lines — to produce every teacher's monthly attribution
 * base for `percentage-of-monthly-fees` payroll rules. A teacher who taught
 * zero, one, or all N subjects on a line contributes zero, one, or N shares of
 * it respectively.
 */
export const TeacherFeeAttributionPolicy = {
  attribute(lines: readonly StudentLineAttributionInput[]): readonly TeacherAttributedAmount[] {
    const totals = new Map<TeacherId, number>();

    for (const line of lines) {
      if (line.subjectAssignments.length === 0) {
        throw new EmptyAttributionLineError(line.studentId);
      }
      for (const share of splitLineAmount(line)) {
        totals.set(share.teacherId, (totals.get(share.teacherId) ?? 0) + share.shareMad);
      }
    }

    return Array.from(totals, ([teacherId, attributedAmountMad]) => ({ teacherId, attributedAmountMad }));
  },
};
