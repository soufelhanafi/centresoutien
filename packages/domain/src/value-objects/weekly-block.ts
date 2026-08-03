import { fromMinutes, toMinutes, type TimeOfDay } from './time-of-day';
import type { WeekdayIndex } from './weekday';

/**
 * A recurring weekly time block: one weekday and a `[start, end)` slot, with no
 * date, no room, and no envelope. It is the *pattern* the session generator
 * (SOU-158) proposes per group — not a materialized dated occurrence (that
 * concrete `Session` comes from {@link GenerateSessions}) and not a persisted
 * `WeeklyRecurringSession` (which additionally carries room, teacher, group, and
 * the sync envelope). Room assignment onto a block is SOU-161.
 */
export type WeeklyBlock = {
  readonly dayOfWeek: WeekdayIndex;
  readonly start: TimeOfDay;
  readonly end: TimeOfDay;
};

/**
 * Build a {@link WeeklyBlock} that opens exactly when the center opens on
 * `dayOfWeek` and runs for `durationMinutes` — the placement rule the session
 * generator uses (SOU-158 KICKOFF: `start = CenterHours.open`, `end = start +
 * sessionDurationMinutes`). `durationMinutes` must be a positive integer.
 * Whether the resulting `end` still sits inside opening hours is a center-hours
 * conflict check owned by SOU-161, not this pure builder; a block that would run
 * past midnight throws via {@link fromMinutes}.
 */
export function weeklyBlockFromOpen(
  dayOfWeek: WeekdayIndex,
  open: TimeOfDay,
  durationMinutes: number,
): WeeklyBlock {
  return {
    dayOfWeek,
    start: open,
    end: fromMinutes(toMinutes(open) + durationMinutes),
  };
}
