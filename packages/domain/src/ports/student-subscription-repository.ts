import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type {
  StudentSubscription,
  StudentSubscriptionId,
} from '../entities/student-subscription';
import type { StudentId } from '../entities/student';
import type { GroupKind } from '../entities/group';

/**
 * Persistence port for StudentSubscriptions. Inherits the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`); reads exclude
 * tombstones, and there is no hard delete. Subscriptions are identified by their
 * relationships, not people-like matching, so there is no `findByNaturalKey`, and
 * there is no editable `status` column — status is derived from the month range.
 *
 * The extra reads back the three needs of SOU-63: `listLiveByStudent` feeds both the
 * coverage adapter (`activeCoverage`) and the student's subscription list;
 * `listLiveByStudentAndKind` feeds the at-most-one-active overlap guard in
 * `CreateStudentSubscription`. "Live" here means a non-tombstoned row — a
 * soft-deleted subscription counts for neither.
 */
export interface StudentSubscriptionRepository
  extends SoftDeletableRepository<StudentSubscriptionId, StudentSubscription> {
  /**
   * Every **live** subscription the student holds, newest start first — the input
   * to coverage resolution and the student's subscription history view.
   */
  listLiveByStudent(studentId: StudentId): Promise<readonly StudentSubscription[]>;
  /**
   * The student's **live** subscriptions of a single track — the candidate set the
   * overlap invariant checks a new subscription's range against.
   */
  listLiveByStudentAndKind(
    studentId: StudentId,
    kind: GroupKind,
  ): Promise<readonly StudentSubscription[]>;
}
