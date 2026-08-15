import type { Brand } from '../value-objects/brand';
import type { TeacherId } from './teacher';
import type { EntityEnvelope } from './envelope';
import type { WeeklyTimeWindows } from './center-hours-override';

/** ULID id prefix for teacher-availability rows: `tav_01HW…`. */
export const TEACHER_AVAILABILITY_ID_PREFIX = 'tav';

export type TeacherAvailabilityId = Brand<string, 'TeacherAvailabilityId'>;

/**
 * A teacher's declared weekly teaching windows (SOU-259) — when the director
 * says this teacher can be scheduled, per weekday. One row per teacher (unique
 * on `(centerCode, teacherId)` among live rows); **absence of a row means the
 * teacher is unrestricted** — availability is an opt-in convenience layer, so a
 * teacher nobody configured is never flagged. A weekday's empty list means the
 * teacher is off that whole day. Reuses {@link WeeklyTimeWindows} so a day can
 * carry split windows (e.g. `09:00–12:00` then `15:00–18:00`), each list ordered
 * and non-overlapping.
 *
 * Availability is a **soft signal**, never a hard scheduling constraint: the
 * generator and the preview flag out-of-window placements
 * (`GeneratedScheduleConflict` kind `teacher-availability`) and the admin may
 * force them, exactly like a SOU-189 teacher double-book. Not people-like, so no
 * `naturalKey`. Soft-delete only; standard envelope.
 */
export type TeacherAvailability = EntityEnvelope & {
  readonly id: TeacherAvailabilityId;
  readonly teacherId: TeacherId;
  weeklyWindows: WeeklyTimeWindows;
};
