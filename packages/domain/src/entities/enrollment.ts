import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';
import type { EntityId } from '../value-objects/ids';
import type { StudentId } from './student';
import type { GroupId } from './group';

/** ULID id prefix for enrollments: `enr_01HW…`. */
export const ENROLLMENT_ID_PREFIX = 'enr';

export type EnrollmentId = Brand<string, 'EnrollmentId'>;

/*
 * The small joining entity that places a student in a group (CLAUDE.md §7). It
 * carries no fee — a student pays for a Formula via their StudentSubscription;
 * the group is only where they learn, and the enrollment is the attendance link.
 * A student attends a group only if their active subscription of the matching
 * `kind` covers the group's `subjectId` and they are explicitly enrolled here —
 * this entity is that explicit enrollment.
 *
 * `startMonth` / `endMonth` are inclusive `YYYY-MM` bounds; `endMonth: null` means
 * "open-ended". They are lifecycle metadata for reporting — seat occupancy in this
 * ticket is governed purely by soft-delete (an unenrolled student's row is
 * tombstoned and no longer counts against `Group.capacity`), not by `endMonth`.
 *
 * Not people-like, so it carries no `naturalKey` — an enrollment is identified by
 * its relationships (student + group), not by a matching key. Soft-delete only:
 * `UnenrollStudent` sets `deletedAt`; a tombstoned row still syncs.
 *
 * `unenrolledUnderTeacherId` snapshots the group's teacher at the moment the
 * student is unenrolled (SOU-301). A group's `teacherId` is overwritten on
 * reassignment and there is no teacher-assignment history, so "who taught this
 * student while they were enrolled" is not recoverable from the group's current
 * assignment — the departed student would otherwise be attributed to whoever holds
 * the group now, placing a prior teacher's leavers on the new teacher's "Partis"
 * roster. Stamped only on unenroll; `null` while the enrollment is live, `null`
 * on tombstones that predate this field, and `null` when the group was unstaffed at
 * unenroll time. A `null` snapshot is attributed to no teacher on the roster (the
 * roster never guesses). It mirrors `Group.teacherId`'s generic `EntityId`
 * (nullable — a group may be unstaffed when a student leaves).
 */
export type Enrollment = EntityEnvelope & {
  readonly id: EnrollmentId;
  studentId: StudentId;
  groupId: GroupId;
  startMonth: string; // 'YYYY-MM', inclusive
  endMonth: string | null; // 'YYYY-MM' inclusive, or null when open-ended
  unenrolledUnderTeacherId: EntityId | null;
};
