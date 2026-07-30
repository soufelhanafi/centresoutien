import {
  MalformedSessionTimeError,
  RoomConflictError,
  SessionOutsideCenterHoursError,
  TeacherConflictError,
  type ScheduledSessionRef,
} from '../errors/scheduling-errors';
import { toMinutes, type TimeOfDay } from '../value-objects/time-of-day';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { RoomId } from '../entities/room';
import type { EntityId } from '../value-objects/ids';
import type { CenterHours } from '../entities/center-hours';

/** A candidate session's placement, independent of the (not-yet-built) Session entity. */
export type SessionTimeCandidate = {
  dayOfWeek: WeekdayIndex;
  start: TimeOfDay;
  end: TimeOfDay;
};

/** A candidate placement that also names the room it wants to occupy. */
export type RoomSessionCandidate = SessionTimeCandidate & {
  roomId: RoomId;
};

/** A candidate placement that also names the teacher it books. */
export type TeacherSessionCandidate = SessionTimeCandidate & {
  teacherId: EntityId;
};

/** Just the fields the hours checks read — decoupled from the full envelope. */
export type DayHours = Pick<CenterHours, 'dayOfWeek' | 'open' | 'close'>;

/**
 * Strict half-open overlap: two intervals clash only when each starts before the
 * other ends. Touching endpoints (back-to-back, `end === start`) do **not**
 * overlap; a single shared minute does.
 */
function strictlyOverlaps(a: SessionTimeCandidate, b: ScheduledSessionRef): boolean {
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
}

/**
 * Pure scheduling conflict checks (CLAUDE.md §6). Each check **returns** the
 * violation (or `null`) rather than throwing, so composite conflict detection
 * (SOU-55: room + teacher + hours) can gather several results in one pass; the
 * scheduling use case throws the returned error. No I/O, no clock — the caller
 * supplies the week it already loaded.
 */
export const SessionConflictPolicy = {
  /**
   * A candidate's time range must be well-formed: `end` strictly after `start`.
   * A backwards (`11:00`–`10:00`) or zero-length slot yields a
   * {@link MalformedSessionTimeError}. The overlap and hours checks assume a
   * positive-duration interval, so composite detection runs this first and
   * short-circuits — a backwards slot inside opening hours would otherwise slip
   * past {@link withinCenterHours} (SOU-29 review hand-off).
   */
  wellFormed(candidate: SessionTimeCandidate): MalformedSessionTimeError | null {
    if (toMinutes(candidate.start) < toMinutes(candidate.end)) return null;
    return new MalformedSessionTimeError(candidate.dayOfWeek, candidate.start, candidate.end);
  },

  /**
   * A session must fall on an open day and sit within `[open, close]`. A missing
   * or closed day, a start before open, or an end after close each yield a
   * {@link SessionOutsideCenterHoursError}. Boundaries are inclusive — a session
   * may start exactly at open and end exactly at close.
   */
  withinCenterHours(
    candidate: SessionTimeCandidate,
    week: readonly DayHours[],
  ): SessionOutsideCenterHoursError | null {
    const day = week.find((hours) => hours.dayOfWeek === candidate.dayOfWeek) ?? null;
    if (day === null || day.open === null || day.close === null) {
      return new SessionOutsideCenterHoursError(
        candidate.dayOfWeek,
        'closed',
        day?.open ?? null,
        day?.close ?? null,
      );
    }
    if (toMinutes(candidate.start) < toMinutes(day.open)) {
      return new SessionOutsideCenterHoursError(candidate.dayOfWeek, 'before-open', day.open, day.close);
    }
    if (toMinutes(candidate.end) > toMinutes(day.close)) {
      return new SessionOutsideCenterHoursError(candidate.dayOfWeek, 'after-close', day.open, day.close);
    }
    return null;
  },

  /**
   * A candidate must not overlap another active weekly session **in the same
   * room on the same day**. The caller supplies the already-loaded active refs
   * (same center, not soft-deleted); this check filters to the matching room and
   * day, keeps the {@link strictlyOverlaps} clashes, and returns a
   * {@link RoomConflictError} carrying every overlapping ref — or `null` when the
   * slot is free. Back-to-back sessions (one ends exactly as the next starts) are
   * allowed; any shared minute is a conflict.
   */
  roomConflict(
    candidate: RoomSessionCandidate,
    existing: readonly ScheduledSessionRef[],
  ): RoomConflictError | null {
    const conflicts = existing.filter(
      (ref) =>
        ref.roomId === candidate.roomId &&
        ref.dayOfWeek === candidate.dayOfWeek &&
        strictlyOverlaps(candidate, ref),
    );
    if (conflicts.length === 0) return null;
    return new RoomConflictError(candidate.roomId, candidate.dayOfWeek, conflicts);
  },

  /**
   * A candidate must not overlap another active weekly session **booked for the
   * same teacher on the same day** — a teacher is in one place at a time. Same
   * return-not-throw shape as {@link roomConflict}: filter the already-loaded
   * active refs (same center, not soft-deleted) to the matching teacher and day,
   * keep the {@link strictlyOverlaps} clashes, and return a
   * {@link TeacherConflictError} carrying every overlapping ref — or `null` when
   * the teacher is free. Refs with no `teacherId` never match and are skipped.
   */
  teacherConflict(
    candidate: TeacherSessionCandidate,
    existing: readonly ScheduledSessionRef[],
  ): TeacherConflictError | null {
    const conflicts = existing.filter(
      (ref) =>
        ref.teacherId === candidate.teacherId &&
        ref.dayOfWeek === candidate.dayOfWeek &&
        strictlyOverlaps(candidate, ref),
    );
    if (conflicts.length === 0) return null;
    return new TeacherConflictError(candidate.teacherId, candidate.dayOfWeek, conflicts);
  },
} as const;
