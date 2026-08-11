import {
  MalformedSessionTimeError,
  RoomConflictError,
  SessionOnHolidayError,
  SessionOutsideCenterHoursError,
  TeacherConflictError,
  type OutsideCenterHoursReason,
  type ScheduledSessionRef,
} from '../errors/scheduling-errors';
import { holidayOn, type HolidayOccurrence } from './holiday-policy';
import { toMinutes, type TimeOfDay } from '../value-objects/time-of-day';
import { timeWindowsContain, type TimeWindow } from '../value-objects/time-window';
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
export type DayHours = Pick<CenterHours, 'dayOfWeek' | 'windows'>;

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
   * A session must fall on an open day and sit entirely inside one of the day's
   * opening `windows` — never across a break (SOU-197: the mid-day gap is
   * closed). Delegates to the same fit test as {@link withinWindows} so the
   * static week and a dated override share one rule. A missing or closed day, a
   * start before the first window, an end after the last, or a slot landing in a
   * gap each yield a {@link SessionOutsideCenterHoursError}. Boundaries are
   * inclusive — a session may start exactly at a window's open and end exactly
   * at its close.
   */
  withinCenterHours(
    candidate: SessionTimeCandidate,
    week: readonly DayHours[],
  ): SessionOutsideCenterHoursError | null {
    const day = week.find((hours) => hours.dayOfWeek === candidate.dayOfWeek) ?? null;
    if (day === null) {
      return new SessionOutsideCenterHoursError(candidate.dayOfWeek, 'closed', null, null);
    }
    return withinWindowsFit(candidate, day.windows);
  },

  /**
   * The date-aware, multi-window sibling of {@link withinCenterHours} (SOU-165):
   * a candidate must fall entirely inside one of the day's opening `windows`. The
   * caller resolves `windows` for the concrete date first (override precedence
   * over static hours lives in `resolveEffectiveWindows`), so this check is a
   * pure fit test and never reads a date itself. Boundaries are inclusive.
   *
   * An empty `windows` is a closed day (`closed`). A range that starts before the
   * first window opens is `before-open`; one that ends after the last window
   * closes is `after-close`; one that lands in a gap between windows — the iftar
   * break — is `outside-windows`. The `open`/`close` carried are the day's first
   * open and last close so the renderer can say when the center is actually open.
   */
  withinWindows(
    candidate: SessionTimeCandidate,
    windows: readonly TimeWindow[],
  ): SessionOutsideCenterHoursError | null {
    return withinWindowsFit(candidate, windows);
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
   * A session must not fall on a day the center is closed for a holiday
   * (CLAUDE.md §6). The caller supplies the concrete calendar date of the session
   * instance (`YYYY-MM-DD`) and the center's holidays; this returns a
   * {@link SessionOnHolidayError} naming the first matching holiday, or `null`
   * when the day is clear. `fixed` holidays match on month-day every year, `lunar`
   * ones only in their entered year — the recurrence math lives in
   * {@link holidayOn}. Invoicing is never affected: this only guards scheduling.
   */
  notOnHoliday(
    candidateDate: string,
    holidays: readonly HolidayOccurrence[],
  ): SessionOnHolidayError | null {
    const match = holidayOn(candidateDate, holidays);
    return match === null ? null : new SessionOnHolidayError(candidateDate, match.id, match.name);
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
        ref.teacherId !== undefined &&
        ref.teacherId === candidate.teacherId &&
        ref.dayOfWeek === candidate.dayOfWeek &&
        strictlyOverlaps(candidate, ref),
    );
    if (conflicts.length === 0) return null;
    return new TeacherConflictError(candidate.teacherId, candidate.dayOfWeek, conflicts);
  },
} as const;

/**
 * The one window-fit test every hours check shares (SOU-197): does `[start, end]`
 * sit entirely inside one of `windows`? Empty `windows` is a closed day
 * (`closed`); a miss is classified as `before-open`, `after-close`, or
 * `outside-windows` from the day's first open and last close.
 */
function withinWindowsFit(
  candidate: SessionTimeCandidate,
  windows: readonly TimeWindow[],
): SessionOutsideCenterHoursError | null {
  const first = windows[0];
  const last = windows[windows.length - 1];
  if (first === undefined || last === undefined) {
    return new SessionOutsideCenterHoursError(candidate.dayOfWeek, 'closed', null, null);
  }
  if (timeWindowsContain(windows, candidate.start, candidate.end)) return null;
  const reason: OutsideCenterHoursReason =
    toMinutes(candidate.start) < toMinutes(first.open)
      ? 'before-open'
      : toMinutes(candidate.end) > toMinutes(last.close)
        ? 'after-close'
        : 'outside-windows';
  return new SessionOutsideCenterHoursError(candidate.dayOfWeek, reason, first.open, last.close);
}
