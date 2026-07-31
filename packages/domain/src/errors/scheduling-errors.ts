import { DomainError } from './plan-errors';
import type { EntityId } from '../value-objects/ids';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { RoomId } from '../entities/room';
import type { HolidayId } from '../entities/holiday';

/** Why a session falls outside the center's opening hours. */
export type OutsideCenterHoursReason = 'closed' | 'before-open' | 'after-close';

/**
 * The minimal shape of an already-scheduled weekly session the room and teacher
 * checks read and the conflict errors carry. The caller pre-filters to
 * same-center, non-deleted, active refs — the policy stays pure and never
 * touches the envelope or soft-delete state. Lives here (the leaf that owns the
 * error payload) so `policies` depends on `errors` one-way, never the reverse.
 *
 * `teacherId` is optional: a ref with no teacher (or a room-only caller from
 * SOU-35) is simply skipped by the teacher-overlap check. It is an `EntityId`
 * rather than a `TeacherId` for the same reason `id` is — the Teacher entity is
 * not built yet (see `value-objects/ids.ts`); strengthen the brand when it lands.
 */
export type ScheduledSessionRef = {
  id: EntityId;
  roomId: RoomId;
  teacherId?: EntityId;
  dayOfWeek: WeekdayIndex;
  start: TimeOfDay;
  end: TimeOfDay;
};

/**
 * Thrown when a session would start before the center opens, end after it
 * closes, or fall on a closed day (CLAUDE.md §6, `SessionConflictPolicy`). The
 * `reason` and the day's `open`/`close` are carried so the renderer can build a
 * localized message via `t(\`errors.${...}\`)` without the domain formatting
 * strings. Scheduling wires this at the calendar seam in SOU-55.
 */
export class SessionOutsideCenterHoursError extends DomainError {
  constructor(
    readonly dayOfWeek: WeekdayIndex,
    readonly reason: OutsideCenterHoursReason,
    readonly open: TimeOfDay | null,
    readonly close: TimeOfDay | null,
  ) {
    super(`Session on weekday ${dayOfWeek} is outside center hours (${reason}).`);
  }
}

/**
 * Thrown when a candidate weekly session would overlap one or more active
 * sessions already scheduled in the same room on the same day (CLAUDE.md §6,
 * `SessionConflictPolicy.roomConflict`). The overlapping `conflicts` — plus the
 * `roomId` and `dayOfWeek` — are carried as structured data so the renderer can
 * localize the message and list the clashes, without the domain formatting
 * strings. Scheduling wires this at the calendar seam in SOU-55.
 */
export class RoomConflictError extends DomainError {
  constructor(
    readonly roomId: RoomId,
    readonly dayOfWeek: WeekdayIndex,
    readonly conflicts: readonly ScheduledSessionRef[],
  ) {
    super(`Session on weekday ${dayOfWeek} overlaps ${conflicts.length} session(s) in the same room.`);
  }
}

/**
 * Thrown when a session would fall on a day the center is closed for a holiday
 * (CLAUDE.md §6, `SessionConflictPolicy.notOnHoliday`). The offending `date`
 * (`YYYY-MM-DD`) and the matched holiday's `holidayId` + bilingual `holidayName`
 * are carried as structured data so the renderer can localize the message and
 * name the holiday, without the domain formatting strings. Single-session
 * creation on a holiday is rejected; the future session generator (SOU-56) uses
 * the same policy to skip holiday days when materializing recurring sessions.
 */
export class SessionOnHolidayError extends DomainError {
  constructor(
    readonly date: string,
    readonly holidayId: HolidayId,
    readonly holidayName: { fr: string; ar: string },
  ) {
    super(`Session on ${date} falls on holiday "${holidayName.fr}".`);
  }
}

/**
 * Thrown when a candidate weekly session would overlap one or more active
 * sessions already scheduled for the **same teacher on the same day** — a
 * teacher cannot be in two places at once (CLAUDE.md §6,
 * `SessionConflictPolicy.teacherConflict`). Mirrors {@link RoomConflictError}:
 * the overlapping `conflicts`, `teacherId`, and `dayOfWeek` are carried as
 * structured data so the renderer localizes the message. `teacherId` is an
 * `EntityId` pending the Teacher entity, matching {@link ScheduledSessionRef}.
 */
export class TeacherConflictError extends DomainError {
  constructor(
    readonly teacherId: EntityId,
    readonly dayOfWeek: WeekdayIndex,
    readonly conflicts: readonly ScheduledSessionRef[],
  ) {
    super(`Session on weekday ${dayOfWeek} overlaps ${conflicts.length} session(s) for the same teacher.`);
  }
}

/**
 * Thrown when a candidate session's time range is not well-formed — its `end`
 * does not fall strictly after its `start` (a backwards or zero-length slot).
 * The overlap and center-hours checks assume a positive-duration interval, so
 * the composite check rejects a malformed candidate up front. Flagged forward
 * from the SOU-29 review: `withinCenterHours` alone would accept a backwards
 * slot that still sits inside opening hours.
 */
export class MalformedSessionTimeError extends DomainError {
  constructor(
    readonly dayOfWeek: WeekdayIndex,
    readonly start: TimeOfDay,
    readonly end: TimeOfDay,
  ) {
    super(`Session on weekday ${dayOfWeek} has a non-positive duration (${start}–${end}).`);
  }
}
