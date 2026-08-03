import type { SubjectId } from '../entities/subject';
import { splitLineAmount, type StudentLineAttributionInput } from './teacher-fee-attribution-policy';

/** One subject's monthly collected-revenue share — the input to SOU-100's per-subject breakdown widget. */
export type SubjectAttributedAmount = {
  readonly subjectId: SubjectId;
  readonly attributedAmountMad: number;
};

/**
 * Same equal-split largest-remainder math as `TeacherFeeAttributionPolicy`
 * (reuses its {@link splitLineAmount}, SOU-100 KICKOFF), grouped by subject
 * instead of teacher. Unlike the teacher split, **no share is ever dropped**:
 * every subject named on a line is real (there is no "unresolved subject",
 * only an unresolved teacher), so the sum of this policy's output always
 * equals the sum of the input lines' `lineAmountMad`.
 */
export const SubjectRevenueAttributionPolicy = {
  attribute(lines: readonly StudentLineAttributionInput[]): readonly SubjectAttributedAmount[] {
    const totals = new Map<SubjectId, number>();

    for (const line of lines) {
      for (const share of splitLineAmount(line)) {
        totals.set(share.subjectId, (totals.get(share.subjectId) ?? 0) + share.shareMad);
      }
    }

    return Array.from(totals, ([subjectId, attributedAmountMad]) => ({ subjectId, attributedAmountMad }));
  },
};
