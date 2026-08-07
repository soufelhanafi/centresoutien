import { DomainError } from './plan-errors';
import type { RoomId } from '../entities/room';
import type { SubjectId } from '../entities/subject';
import type { GroupId } from '../entities/group';

/**
 * Thrown when a group is bound to a room that cannot seat it: a weekly recurring
 * session links `groupId` to `roomId` whose capacity is below the group's seat
 * ceiling. Since SOU-176, rooms attach at session creation, so this invariant
 * lives at the session seam — the `CreateWeeklyRecurringSession` /
 * `UpdateWeeklyRecurringSession` gates fire it, and the capacity-edit guards on
 * `UpdateGroup` (raising capacity) and `UpdateRoom` (lowering capacity) re-check
 * existing bindings so the invariant holds at rest. The renderer resolves the
 * stable `group-over-capacity` code via `t(\`errors.${code}\`)`.
 */
export class GroupOverCapacityError extends DomainError {
  readonly code = 'group-over-capacity';

  constructor(
    readonly groupId: GroupId,
    readonly groupCapacity: number,
    readonly roomId: RoomId,
    readonly roomCapacity: number,
  ) {
    super(
      `Group "${groupId}" capacity ${groupCapacity} exceeds room "${roomId}" capacity ${roomCapacity}.`,
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

/**
 * Thrown when an update, archive, or restore targets a group id that has no
 * matching row in the current center — unknown, or (for the live-row paths)
 * already tombstoned, or belonging to another center. The renderer resolves the
 * stable `group-not-found` code via `t(\`errors.${code}\`)`; the domain stays
 * i18n-agnostic. Mirrors {@link RoomNotFoundError} so the group and room CRUD use
 * cases behave consistently and neither silently no-ops on a stale/foreign id.
 */
export class GroupNotFoundError extends DomainError {
  readonly code = 'group-not-found';

  constructor(readonly groupId: GroupId) {
    super(`No live group with id "${groupId}".`);
  }
}
