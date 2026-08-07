import { DomainError } from './plan-errors';
import type { EnrollmentId } from '../entities/enrollment';
import type { GroupId, GroupKind } from '../entities/group';
import type { StudentId } from '../entities/student';
import type { SubjectId } from '../entities/subject';

/**
 * Thrown when a student is enrolled into a group that has already reached its seat
 * ceiling — the number of **live** enrollments equals `Group.capacity`
 * (SOU-121 runtime seat-full guard). Rooms are not attached to groups (SOU-176),
 * so the ceiling is purely the group's own `capacity`. The renderer maps the
 * stable `group-full` code and can show `capacity`.
 */
export class GroupFullError extends DomainError {
  readonly code = 'group-full';

  constructor(
    readonly groupId: GroupId,
    readonly capacity: number,
  ) {
    super(`Group "${groupId}" is full (capacity ${capacity}).`);
  }
}

/**
 * Thrown when a student is enrolled into a group whose `kind` does not match the
 * `kind` of their active subscription that covers the group's subject — the
 * exam-prep isolation rule (CLAUDE.md §7). A student on only a regular
 * subscription can never join an exam-prep group, and vice versa. The renderer
 * resolves the stable `cross-kind-enrollment` code; the domain stays i18n-agnostic.
 */
export class CrossKindEnrollmentError extends DomainError {
  readonly code = 'cross-kind-enrollment';

  constructor(
    readonly studentId: StudentId,
    readonly groupId: GroupId,
    readonly groupKind: GroupKind,
    readonly subscriptionKind: GroupKind,
  ) {
    super(
      `Student "${studentId}" holds a "${subscriptionKind}" subscription and cannot ` +
        `join "${groupKind}" group "${groupId}".`,
    );
  }
}

/**
 * Thrown when a student has no active subscription covering the group's subject for
 * the enrollment month — enrollment requires an active subscription of the matching
 * kind that covers the group's `subjectId` (CLAUDE.md §7). The renderer resolves the
 * stable `enrollment-subscription-missing` code; the domain stays i18n-agnostic.
 */
export class EnrollmentSubscriptionMissingError extends DomainError {
  readonly code = 'enrollment-subscription-missing';

  constructor(
    readonly studentId: StudentId,
    readonly groupId: GroupId,
    readonly subjectId: SubjectId,
    readonly month: string,
  ) {
    super(
      `Student "${studentId}" has no active subscription covering subject "${subjectId}" ` +
        `in ${month} (group "${groupId}").`,
    );
  }
}

/**
 * Thrown when a student already holds a **live** enrollment in the target group —
 * the duplicate-enrollment guard (SOU-123). Idempotency is a domain
 * responsibility here, not a `UNIQUE(studentId, groupId)` DB index: a benign
 * double-click (or two laptops enrolling the same student before a sync) must
 * *converge* to one live row on sync-resolve, never fail the push. A re-enroll
 * after an unenroll is allowed — the tombstoned row does not count. The renderer
 * resolves the stable `duplicate-enrollment` code; the domain stays i18n-agnostic.
 */
export class DuplicateEnrollmentError extends DomainError {
  readonly code = 'duplicate-enrollment';

  constructor(
    readonly studentId: StudentId,
    readonly groupId: GroupId,
  ) {
    super(`Student "${studentId}" already holds a live enrollment in group "${groupId}".`);
  }
}

/**
 * Thrown when an unenroll targets an enrollment id that has no live row — unknown,
 * already unenrolled (tombstoned), or belonging to another center. The renderer
 * resolves the stable `enrollment-not-found` code; the domain stays i18n-agnostic.
 */
export class EnrollmentNotFoundError extends DomainError {
  readonly code = 'enrollment-not-found';

  constructor(readonly id: EnrollmentId) {
    super(`No live enrollment with id "${id}".`);
  }
}
