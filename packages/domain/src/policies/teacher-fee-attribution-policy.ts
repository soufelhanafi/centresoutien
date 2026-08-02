import type { SubjectId } from '../entities/subject';
import type { TeacherId } from '../entities/teacher';
import type { StudentId } from '../entities/student';
import { EmptyAttributionLineError, InvalidAttributionAmountError } from '../errors/payroll-errors';

/**
 * One subject on a billed line, paired with the teacher who taught it to this
 * student that month — or `null` if no group/teacher is resolvable for that
 * subject yet (a center mid-way through staffing). A `null` entry still counts
 * toward the equal split's denominator (CLAUDE.md §6 step 2: split across the
 * formula's subjects, not across only its staffed ones) but is dropped before
 * summing into any teacher's total (SOU-74 M1) — its share goes unattributed,
 * never redistributed to a teacher who didn't teach it.
 */
export type SubjectTeacherAssignment = {
  readonly subjectId: SubjectId;
  readonly teacherId: TeacherId | null;
};

/**
 * One student's collected invoice line for the month, reduced to exactly what
 * equal-split attribution needs. `lineAmountMad` is already the caller's
 * concern to have filtered to fees actually collected (CLAUDE.md §6 step 4);
 * `subjectAssignments` carries one entry per subject **on the formula**, not
 * just the resolvable ones — each carrying the teacher of the group the
 * student attended for that subject, or `null` if unresolved (SOU-73 KICKOFF,
 * amended SOU-74 M1) — this policy never touches Enrollment/Group/Payment
 * repositories itself.
 */
export type StudentLineAttributionInput = {
  readonly studentId: StudentId;
  /** Non-negative integer MAD centimes — the largest-remainder split only guarantees an exact sum for this shape. */
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
 * deterministic for a given line. `count` is the full subject count on the
 * line — including subjects whose `teacherId` is `null` — so an unstaffed
 * subject still claims its share of the denominator; the caller drops that
 * share rather than folding it into a staffed subject's cut (SOU-74 M1).
 */
function splitLineAmount(
  line: StudentLineAttributionInput,
): readonly { readonly teacherId: TeacherId | null; readonly shareMad: number }[] {
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
 * it respectively. A subject with no resolvable teacher (`teacherId: null`)
 * still claims its 1/N share of the line, but that share is unattributed —
 * dropped, never folded into another subject's teacher (SOU-74 M1) — so the
 * sum of `attribute`'s output can be less than the line total whenever a
 * formula is only partially staffed.
 */
export const TeacherFeeAttributionPolicy = {
  attribute(lines: readonly StudentLineAttributionInput[]): readonly TeacherAttributedAmount[] {
    const totals = new Map<TeacherId, number>();

    for (const line of lines) {
      if (line.subjectAssignments.length === 0) {
        throw new EmptyAttributionLineError(line.studentId);
      }
      if (!Number.isInteger(line.lineAmountMad) || line.lineAmountMad < 0) {
        throw new InvalidAttributionAmountError(line.studentId, line.lineAmountMad);
      }
      for (const share of splitLineAmount(line)) {
        if (share.teacherId === null) continue;
        totals.set(share.teacherId, (totals.get(share.teacherId) ?? 0) + share.shareMad);
      }
    }

    return Array.from(totals, ([teacherId, attributedAmountMad]) => ({ teacherId, attributedAmountMad }));
  },
};
