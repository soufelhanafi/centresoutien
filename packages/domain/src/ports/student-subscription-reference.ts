import type { StudentId } from '../entities/student';
import type { SubjectId } from '../entities/subject';
import type { GroupKind } from '../entities/group';

/**
 * ⚠️ DECLARED CONTRACT ONLY — NO ADAPTER IN SOU-121.
 *
 * Publishes the *shape* the `EnrollStudent` subscription-coverage guard depends on
 * so the guard is fully testable now (against an in-memory fake) while the real
 * implementation is still on the roadmap. The `StudentSubscription` entity and its
 * repository land in **SOU-63** (close-and-reopen policy); the concrete adapter — a
 * query over the student's active subscriptions and their formulas' subjects — is
 * wired into `EnrollStudent` at the composition root then, with no change to this
 * contract or to the use case. Same declared-only pattern as SOU-45's
 * `SubjectReferencePort` and SOU-32's `RoomReferencePort`.
 *
 * "Active coverage" means: for the given `month`, the student holds a live
 * subscription to a Formula whose subjects include `subjectId`. The returned
 * `kind` is that subscription's track (`regular` | `exam-prep`), which
 * `EnrollStudent` compares against the group's `kind` for the exam-prep isolation
 * rule. `null` means no such subscription — enrollment is refused.
 */
export type ActiveSubscriptionCoverage = {
  /** The covering subscription's track — compared against the group's `kind`. */
  kind: GroupKind;
};

export interface StudentSubscriptionReferencePort {
  /**
   * The active subscription covering `subjectId` for the student in `month`
   * (`YYYY-MM`), or `null` when none covers it.
   */
  activeCoverage(
    studentId: StudentId,
    subjectId: SubjectId,
    month: string,
  ): Promise<ActiveSubscriptionCoverage | null>;
}
