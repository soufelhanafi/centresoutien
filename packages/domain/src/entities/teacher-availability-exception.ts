import type { Brand } from '../value-objects/brand';
import type { TeacherId } from './teacher';
import type { DateRange } from '../value-objects/date-range';
import type { EntityEnvelope } from './envelope';

/** ULID id prefix for teacher-availability-exception rows: `tae_01HW…`. */
export const TEACHER_AVAILABILITY_EXCEPTION_ID_PREFIX = 'tae';

export type TeacherAvailabilityExceptionId = Brand<string, 'TeacherAvailabilityExceptionId'>;

/**
 * A one-off, date-bounded absence for a teacher (SOU-259) — vacation, exam
 * supervision, travel — beyond the weekly {@link TeacherAvailability} pattern
 * and independent of center holidays (SOU-30). The teacher is unavailable for
 * **every** day of the inclusive civil-date range; partial-day exceptions are
 * deliberately not modeled — a director reasons in days off, and the weekly
 * windows already cover recurring partial days. `label` is free text for the
 * director's own bookkeeping ("Omra", "congé maladie") and is optional.
 *
 * Like the weekly windows, an exception is a soft signal surfaced as a preview
 * warning (`GeneratedScheduleConflict` kind `teacher-availability`), never a
 * hard block. Not people-like, so no `naturalKey`. Soft-delete only; standard
 * envelope.
 */
export type TeacherAvailabilityException = EntityEnvelope & {
  readonly id: TeacherAvailabilityExceptionId;
  readonly teacherId: TeacherId;
  dateRange: DateRange;
  label: string | null;
};
