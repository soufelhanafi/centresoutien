import { DomainError } from './plan-errors';
import type { StudentDoubleBooking } from '../policies/student-schedule-conflict';

/**
 * A student enrolled in the candidate's group also attends another group whose
 * session overlaps this one — invisible to the room/teacher checks, since a
 * shared student sits outside both resources. It is carried inside a composite
 * `SessionConflict` of kind `student` — a `warning`-severity signal, never a
 * hard block, mirroring {@link TeacherUnavailableError}'s force UX
 * (`allowScheduleConflict`). `conflicts` names every clashing
 * `(studentId, otherGroupId)` pair for same-process consumers (tests, the audit);
 * only `.code` survives the IPC hop, so the renderer shows a generic warning line.
 */
export class StudentDoubleBookedError extends DomainError {
  readonly code = 'student-double-booked';

  constructor(readonly conflicts: readonly StudentDoubleBooking[]) {
    super(`Session overlaps another group for ${conflicts.length} enrolled student(s).`);
  }
}
