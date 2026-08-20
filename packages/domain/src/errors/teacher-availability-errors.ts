import { DomainError } from './plan-errors';
import type { EntityId } from '../value-objects/ids';
import type { DateRange } from '../value-objects/date-range';
import type { TimeWindow } from '../value-objects/time-window';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { TeacherAvailabilityExceptionId } from '../entities/teacher-availability-exception';

/**
 * Why a placement falls outside a teacher's declared availability (SOU-259):
 * `out-of-window` — the block does not fit any of the teacher's weekly windows
 * for that weekday (an empty day counts); `exception` — a one-off absence
 * (vacation) covers at least one concrete occurrence date of the block within
 * the run's materialization range.
 */
export type TeacherUnavailableReason = 'out-of-window' | 'exception';

/**
 * A teacher scheduled outside their declared availability (SOU-259, SOU-283). It
 * is carried inside both a `GeneratedScheduleConflict` and a composite
 * `SessionConflict` of kind `teacher-availability` — a `warning`-severity signal,
 * never a hard block. In the generator preview it stays a gathered warning; on the
 * manual create/edit path (SOU-283) the scheduling use case now **throws** it when
 * it is the sole conflict, so the admin sees the out-of-window placement and can
 * force past it with `allowScheduleConflict`, exactly like a SOU-189 teacher
 * double-book. `windows` are the teacher's windows for the offending weekday
 * (empty = whole day off) and `exception` the covering absence range, so the
 * renderer can localize a message naming when the teacher actually works.
 * `teacherId` is an `EntityId`, matching {@link TeacherConflictError}.
 */
export class TeacherUnavailableError extends DomainError {
  readonly code = 'teacher-unavailable';

  constructor(
    readonly teacherId: EntityId,
    readonly dayOfWeek: WeekdayIndex,
    readonly reason: TeacherUnavailableReason,
    readonly windows: readonly TimeWindow[],
    readonly exception: DateRange | null,
  ) {
    super(`Teacher is unavailable on weekday ${dayOfWeek} (${reason}).`);
  }
}

/**
 * Thrown when an edit or archive targets a teacher-availability-exception id
 * with no live row in the current center — unknown, already tombstoned, or
 * belonging to another center. The renderer resolves the stable code via
 * `t(\`errors.${code}\`)`; the domain stays i18n-agnostic. Mirrors
 * {@link CenterHoursOverrideNotFoundError}.
 */
export class TeacherAvailabilityExceptionNotFoundError extends DomainError {
  readonly code = 'teacher-availability-exception-not-found';

  constructor(readonly id: TeacherAvailabilityExceptionId) {
    super(`No live teacher availability exception with id "${id}".`);
  }
}
