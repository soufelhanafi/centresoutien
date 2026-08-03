import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type {
  StudentSubscription,
  StudentSubscriptionId,
} from '../entities/student-subscription';
import type { StudentId } from '../entities/student';
import type { GroupKind } from '../entities/group';
import type { CenterCode } from '../value-objects/ids';

/**
 * Persistence port for StudentSubscriptions. Inherits the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`); reads exclude
 * tombstones, and there is no hard delete. Subscriptions are identified by their
 * relationships, not people-like matching, so there is no `findByNaturalKey`, and
 * there is no editable `status` column — status is derived from the month range.
 *
 * The extra reads back the needs of SOU-63 and SOU-68: `listLiveByStudent` feeds
 * both the coverage adapter (`activeCoverage`) and the student's subscription
 * list; `listLiveByStudentAndKind` feeds the at-most-one-active overlap guard in
 * `CreateStudentSubscription`; `listLiveByCenter` feeds `GenerateMonthlyInvoices`,
 * which decides "active in month" itself via `isSubscriptionActiveInMonth` — the
 * adapter never filters by month. "Live" here means a non-tombstoned row — a
 * soft-deleted subscription counts for none of the three.
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
  /**
   * Every **live** subscription across the center, both tracks — the center-wide
   * read `GenerateMonthlyInvoices` needs to find every billable student for a month
   * without a per-student round trip.
   */
  listLiveByCenter(centerCode: CenterCode): Promise<readonly StudentSubscription[]>;
  /**
   * Atomically persists a close-then-reopen pair (SOU-141): writes `closed`
   * (the just-capped live subscription) and `created` (its replacement) so the
   * close can **never** commit without its replacement. The adapter runs both
   * writes inside one SQLite transaction — a failure creating the replacement
   * rolls the close back, leaving the original subscription live and untouched.
   * The caller (a `Replace*` use case) computes both entities before calling,
   * so this is a pure translation of intent with no business decisions here.
   */
  replaceLiveSubscription(
    closed: StudentSubscription,
    created: StudentSubscription,
  ): Promise<void>;
}
