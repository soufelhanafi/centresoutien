import { SessionOutsideCenterHoursError } from '../errors/scheduling-errors';
import { toMinutes, type TimeOfDay } from '../value-objects/time-of-day';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { CenterHours } from '../entities/center-hours';

/** A candidate session's placement, independent of the (not-yet-built) Session entity. */
export type SessionTimeCandidate = {
  dayOfWeek: WeekdayIndex;
  start: TimeOfDay;
  end: TimeOfDay;
};

/** Just the fields the hours checks read — decoupled from the full envelope. */
type DayHours = Pick<CenterHours, 'dayOfWeek' | 'open' | 'close'>;

/**
 * Pure scheduling conflict checks (CLAUDE.md §6). Each check **returns** the
 * violation (or `null`) rather than throwing, so composite conflict detection
 * (SOU-55: room + teacher + hours) can gather several results in one pass; the
 * scheduling use case throws the returned error. No I/O, no clock — the caller
 * supplies the week it already loaded.
 */
export const SessionConflictPolicy = {
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
} as const;
