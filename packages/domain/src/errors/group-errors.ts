import { DomainError } from './plan-errors';
import type { RoomId } from '../entities/room';
import type { SubjectId } from '../entities/subject';

/**
 * Thrown when a group's requested `capacity` exceeds the seat capacity of the room
 * it is scheduled into — you cannot seat more students than the room holds
 * (SOU-48 core invariant). The `CreateGroup` use case reads the room and rejects
 * with this before persisting; the renderer maps the stable `group-over-capacity`
 * code to a localized message and can show both numbers.
 *
 * This guards the ceiling at *definition* time. Blocking the Nth enrollment
 * against a live seat count is the Enrollment issue's job, not this one.
 */
export class GroupOverCapacityError extends DomainError {
  readonly code = 'group-over-capacity';

  constructor(
    readonly roomId: RoomId,
    readonly capacity: number,
    readonly roomCapacity: number,
  ) {
    super(
      `Group capacity ${capacity} exceeds room "${roomId}" capacity ${roomCapacity}.`,
    );
  }
}

/** Why a subject cannot back a new group: it has no live row, or it is deactivated. */
export type GroupSubjectUnavailableReason = 'not-found' | 'inactive';

/**
 * Thrown when the `subjectId` a group is created against does not resolve to a
 * live, active Subject of the same center — it is unknown/tombstoned
 * (`not-found`) or deactivated (`inactive`). The renderer resolves the stable
 * `group-subject-not-found` / `group-subject-inactive` code via
 * `t(\`errors.${code}\`)`; the domain stays i18n-agnostic. A deactivated subject
 * stays queryable for history but can no longer seed new groups (CLAUDE.md §7).
 */
export class GroupSubjectUnavailableError extends DomainError {
  readonly code: 'group-subject-not-found' | 'group-subject-inactive';

  constructor(
    readonly subjectId: SubjectId,
    readonly reason: GroupSubjectUnavailableReason,
  ) {
    super(`Subject "${subjectId}" cannot back a group (${reason}).`);
    this.code = reason === 'not-found' ? 'group-subject-not-found' : 'group-subject-inactive';
  }
}
