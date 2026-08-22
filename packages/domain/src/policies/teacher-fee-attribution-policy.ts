import type { SubjectId } from '../entities/subject';
import type { TeacherId } from '../entities/teacher';
import type { StudentId } from '../entities/student';
import { apportionByWeight } from './apportion';
import { EmptyAttributionLineError, InvalidAttributionAmountError } from '../errors/payroll-errors';

/**
 * One subject on a billed line, paired with the teacher who taught it to this
 * student that month — or `null` if no group/teacher is resolvable for that
 * subject yet (a center mid-way through staffing). A `null` entry still counts
 * toward the split's denominator (CLAUDE.md §6 step 2: split across the formula's
 * subjects, not across only its staffed ones) but is dropped before summing into
 * any teacher's total (SOU-74 M1) — its share goes unattributed, never
 * redistributed to a teacher who didn't teach it.
 *
 * `weightMad` (SOU-298) is this subject's slice of the line for the **weighted**
 * split — its amount from the Formula's per-subject price map, or an admin's manual
 * per-invoice allocation. When every assignment on a line has a `0` or absent
 * weight (an un-priced/legacy formula), the split degrades to the original equal
 * one, so old payroll is untouched. Absent is treated as `0`.
 */
export type SubjectTeacherAssignment = {
  readonly subjectId: SubjectId;
  readonly teacherId: TeacherId | null;
  readonly weightMad?: number;
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

/** One subject's equal-split share of a billed line — the shape {@link splitLineAmount} returns. */
export type SubjectLineShare = {
  readonly subjectId: SubjectId;
  readonly teacherId: TeacherId | null;
  readonly shareMad: number;
};

/** A teacher's monthly attribution base for one subject — the payroll dashboard drill-down (SOU-76). */
export type TeacherSubjectAttributedAmount = {
  readonly teacherId: TeacherId;
  readonly subjectId: SubjectId;
  readonly attributedAmountMad: number;
};

/**
 * Validates a `TeacherFeeAttributionPolicy` input line before it is split —
 * shared by {@link splitLineAmount}'s callers (`attribute` here, and
 * `SubjectRevenueAttributionPolicy.attribute`) so the guard lives in exactly
 * one place regardless of which policy groups the shares.
 */
export function assertValidAttributionLine(line: StudentLineAttributionInput): void {
  if (line.subjectAssignments.length === 0) {
    throw new EmptyAttributionLineError(line.studentId);
  }
  if (!Number.isInteger(line.lineAmountMad) || line.lineAmountMad < 0) {
    throw new InvalidAttributionAmountError(line.studentId, line.lineAmountMad);
  }
}

/**
 * Splits `lineAmountMad` across the line's subjects, **weighted** by each
 * assignment's `weightMad` (SOU-298), summing back to `lineAmountMad` exactly via
 * the shared largest-remainder helper {@link apportionByWeight}. When no subject
 * carries a positive weight — an un-priced/legacy formula — the helper falls back
 * to the original equal split (`floor(amount / count)`, leftover to the first
 * subjects in order), so payroll for formulas without a price map is byte-for-byte
 * unchanged. `count` is the full subject count on the line — including subjects
 * whose `teacherId` is `null` — so an unstaffed subject still claims its share of
 * the denominator; a teacher-keyed caller drops that share rather than folding it
 * into a staffed subject's cut (SOU-74 M1) — a subject-keyed caller (SOU-100's
 * revenue breakdown) keeps it, since every subject on the line is real regardless
 * of staffing.
 *
 * Exported (not just `attribute`'s private helper) so `SubjectRevenueAttributionPolicy`
 * reuses the exact same split instead of re-deriving the largest-remainder math.
 */
export function splitLineAmount(line: StudentLineAttributionInput): readonly SubjectLineShare[] {
  assertValidAttributionLine(line);
  const weights = line.subjectAssignments.map((assignment) => assignment.weightMad ?? 0);
  const shares = apportionByWeight(line.lineAmountMad, weights);
  return line.subjectAssignments.map((assignment, index) => ({
    subjectId: assignment.subjectId,
    teacherId: assignment.teacherId,
    shareMad: shares[index] ?? 0,
  }));
}

/**
 * Validates and splits every line, dropping unstaffed (`teacherId: null`)
 * shares — the staffed, per-subject shares both `attribute` and
 * `attributeBySubject` fold from, so the split math and the unstaffed-share
 * drop (SOU-74 M1) live in exactly one place.
 */
function staffedShares(
  lines: readonly StudentLineAttributionInput[],
): readonly { readonly teacherId: TeacherId; readonly subjectId: SubjectId; readonly shareMad: number }[] {
  const shares: { teacherId: TeacherId; subjectId: SubjectId; shareMad: number }[] = [];
  for (const line of lines) {
    for (const share of splitLineAmount(line)) {
      if (share.teacherId === null) continue;
      shares.push({ teacherId: share.teacherId, subjectId: share.subjectId, shareMad: share.shareMad });
    }
  }
  return shares;
}

/**
 * Weighted teacher fee attribution (CLAUDE.md §6, SOU-298). For each student's
 * collected invoice line, splits the amount across its N subjects weighted by
 * the formula's per-subject price map (equal split when the formula is un-priced),
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
    for (const share of staffedShares(lines)) {
      totals.set(share.teacherId, (totals.get(share.teacherId) ?? 0) + share.shareMad);
    }
    return Array.from(totals, ([teacherId, attributedAmountMad]) => ({ teacherId, attributedAmountMad }));
  },

  /**
   * Same equal-split attribution as `attribute`, kept broken out by subject
   * rather than collapsed to a teacher total — the payroll dashboard
   * drill-down (SOU-76) shows *which* subjects made up a teacher's monthly
   * figure, which `attribute`'s per-teacher sum discards.
   */
  attributeBySubject(lines: readonly StudentLineAttributionInput[]): readonly TeacherSubjectAttributedAmount[] {
    const totals = new Map<string, TeacherSubjectAttributedAmount>();
    for (const share of staffedShares(lines)) {
      const key = `${share.teacherId}::${share.subjectId}`;
      const existing = totals.get(key);
      totals.set(key, {
        teacherId: share.teacherId,
        subjectId: share.subjectId,
        attributedAmountMad: (existing?.attributedAmountMad ?? 0) + share.shareMad,
      });
    }
    return Array.from(totals.values());
  },
};
