import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';
import type { StudentId } from './student';
import type { GroupId } from './group';

/** ULID id prefix for enrollments: `enr_01HW…`. */
export const ENROLLMENT_ID_PREFIX = 'enr';

export type EnrollmentId = Brand<string, 'EnrollmentId'>;

/**
 * The small joining entity that places a student in a group (CLAUDE.md §7). It
 * carries **no fee** — a student pays for a Formula via their `StudentSubscription`;
 * the group is only where they learn, and the enrollment is the attendance link.
 * A student attends a group only if their active subscription of the matching
 * `kind` covers the group's `subjectId` *and* they are explicitly enrolled here —
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
 */
export type Enrollment = EntityEnvelope & {
  readonly id: EnrollmentId;
  studentId: StudentId;
  groupId: GroupId;
  startMonth: string; // 'YYYY-MM', inclusive
  endMonth: string | null; // 'YYYY-MM' inclusive, or null when open-ended
};
