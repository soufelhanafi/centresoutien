import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Enrollment, EnrollmentId } from '../entities/enrollment';
import type { GroupId } from '../entities/group';
import type { StudentId } from '../entities/student';
import type { EntityId, UserId } from '../value-objects/ids';

/**
 * Persistence port for Enrollments. Inherits the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`); reads exclude
 * tombstones, and there is no hard delete. Enrollments are identified by their
 * relationships, not people-like matching, so there is no `findByNaturalKey`.
 *
 * The extra reads back the group/student detail screens and the runtime seat-full
 * guard. "Active" here means a **live** (non-tombstoned) enrollment row — an
 * unenrolled student's row is soft-deleted and no longer counted. `endMonth` is
 * lifecycle metadata and is not consulted by these reads in SOU-121.
 *
 * The SQLite adapter and its migration land in a paired follow-up (mirroring the
 * SOU-32 domain → SOU-33 repo split); `EnrollStudent` needs `save` +
 * `countActiveByGroup`, and `UnenrollStudent` needs `findById` + `softDelete`.
 */
export interface EnrollmentRepository
  extends SoftDeletableRepository<EnrollmentId, Enrollment> {
  /** Live enrollments in the group (for the group roster). */
  listActiveByGroup(groupId: GroupId): Promise<readonly Enrollment[]>;
  /**
   * The **tombstoned** (soft-deleted) enrollments in the group — the inverse of
   * {@link listActiveByGroup}, returning only rows with `deletedAt` set. Backs the
   * teacher-roster "left the group" marker (SOU-299): a student unenrolled from one
   * of a teacher's groups still shows on that teacher's roster, tagged with the
   * month they left (the tombstone's `deletedAt`). "Left" is exactly a soft delete —
   * `endMonth` is unused lifecycle metadata and is not consulted here.
   */
  listInactiveByGroup(groupId: GroupId): Promise<readonly Enrollment[]>;
  /**
   * The **tombstoned** enrollments stamped with `teacherId` as the teacher who held
   * the group when the student left — `unenrolled_under_teacher_id = teacherId`
   * (SOU-301). Backs the teacher-roster "Partis" list so a departed student is
   * attributed to the teacher who actually taught them, independent of the group's
   * *current* assignment: after a group is reassigned A→B, A's leavers stay on A's
   * roster because their tombstone snapshots A, not the group's live teacher (B).
   * Only rows with `deletedAt` set and a non-null snapshot match — pre-SOU-301
   * tombstones (snapshot `null`) are handled by the roster's current-teacher
   * fallback via {@link listInactiveByGroup}, not here.
   */
  listInactiveByFormerTeacher(teacherId: EntityId): Promise<readonly Enrollment[]>;
  /**
   * Soft-delete the enrollment **and** snapshot `unenrolledUnderTeacherId` in the
   * same write (SOU-301) — the teacher-aware counterpart to {@link softDelete} that
   * `UnenrollStudent` uses so the departed row records who taught the student. Pass
   * the group's current `teacherId` (or `null` when the group is unstaffed). Sets
   * `deletedAt`/`updatedAt` to `at` and `updatedBy` to `by`, exactly like
   * `softDelete`; still a tombstone, never a hard delete.
   */
  softDeleteUnderTeacher(
    id: EnrollmentId,
    at: Date,
    by: UserId,
    teacherId: EntityId | null,
  ): Promise<void>;
  /** Live enrollments the student holds (for the student detail sheet). */
  listActiveByStudent(studentId: StudentId): Promise<readonly Enrollment[]>;
  /** Live seat count in the group — the number the capacity guard checks against. */
  countActiveByGroup(groupId: GroupId): Promise<number>;
  /**
   * Live seat count for **many** groups in one query — the batch behind the group
   * list's fill % (SOU-127), so the list never fans out one `countActiveByGroup`
   * per row (an N+1). Returns a map keyed by group id; a group with **no** live
   * enrollment is absent from the map (the caller defaults it to 0), mirroring a
   * `GROUP BY` that only yields groups with matching rows. Same "active" semantics
   * as {@link countActiveByGroup} — tombstones (unenrolled rows) are excluded.
   */
  countActiveByGroups(groupIds: readonly GroupId[]): Promise<ReadonlyMap<GroupId, number>>;
  /**
   * Whether the student already holds a **live** (non-tombstoned) enrollment in
   * the group — the duplicate-enrollment guard (SOU-123). `(studentId, groupId)`
   * is the idempotency key: a soft-deleted (unenrolled) row does not count, so
   * re-enrolling after an unenroll is allowed. Deliberately a domain read, not a
   * `UNIQUE(studentId, groupId)` DB index — the constraint must *merge* two
   * concurrent creates on sync, not reject the push.
   */
  hasActiveEnrollment(studentId: StudentId, groupId: GroupId): Promise<boolean>;
  /**
   * Atomically insert the enrollment **iff** the student holds no live enrollment
   * in the group. Returns `true` when the row was inserted, `false` when a live
   * `(studentId, groupId)` already existed.
   *
   * This is the transactional backstop for the check-then-insert TOCTOU (SOU-123
   * review): `EnrollStudent` runs `hasActiveEnrollment` and then persists as two
   * separate awaits, and the event loop can interleave a second concurrent enroll
   * of the same student between them so both pass the pre-check. The adapter runs
   * the seat-existence check and the insert inside **one** transaction, so exactly
   * one of two racing enrolls wins and the other gets `false` (mapped to
   * `DuplicateEnrollmentError` by the use case). `hasActiveEnrollment` stays the
   * cheap pre-check that yields the friendly error *before* the capacity/coverage
   * work; this method is the last-line guarantee. Like every write here it is
   * soft-delete-aware — a tombstoned row does not block the insert.
   */
  saveIfAbsent(enrollment: Enrollment): Promise<boolean>;
}
