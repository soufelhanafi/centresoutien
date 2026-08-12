import { fromMinutes, toMinutes, type TimeOfDay } from './time-of-day';
import type { TimeWindow } from './time-window';
import type { WeekdayIndex } from './weekday';

/**
 * A recurring weekly time block: one weekday and a `[start, end)` slot, with no
 * date, no room, and no envelope. It is the *pattern* the session generator
 * (SOU-158) proposes per group — not a materialized dated occurrence (that
 * concrete `Session` comes from {@link GenerateSessions}) and not a persisted
 * `WeeklyRecurringSession` (which additionally carries room, teacher, group, and
 * the sync envelope). The block itself stays roomless by design: room
 * assignment is a cross-block decision (teacher room-continuity across a
 * generation run), so `SessionGenerator` pairs each block with a `roomId` in
 * its own `ScheduledBlockProposal` output rather than carrying one here.
 * Checking the assigned room against the real, already-committed schedule for
 * double-booking is SOU-161 — this pure engine only ever reasons about the
 * blocks being generated in the same run.
 */
export type WeeklyBlock = {
  readonly dayOfWeek: WeekdayIndex;
  readonly start: TimeOfDay;
  readonly end: TimeOfDay;
};

/**
 * Build a {@link WeeklyBlock} that opens exactly when the center opens on
 * `dayOfWeek` and runs for `durationMinutes` — the placement rule the session
 * generator uses (SOU-158: `start = CenterHours` first window's `open`, `end =
 * start + sessionDurationMinutes`). `durationMinutes` must be a positive
 * integer. Whether the resulting `end` still sits inside opening hours, or
 * collides with an already-committed session on the real calendar, is a conflict
 * check owned by SOU-161, not this pure builder; a block that would run past
 * midnight throws via {@link fromMinutes}.
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

/**
 * Build the group's weekly block on `dayOfWeek`, anchored at the **earliest of
 * `windows` whose span is long enough to hold `durationMinutes`** (SOU-218). On
 * a split day — a mid-day/iftar break splits opening hours into two windows —
 * this lets the generator place a session in the afternoon window when the
 * morning one is too short, instead of always anchoring at the first window and
 * overrunning its close.
 *
 * When no single window is long enough it falls back to the first window's
 * `open`: the resulting overrun is left for {@link detectGeneratedScheduleConflicts}
 * (SOU-161) to surface as a non-blocking hours conflict, rather than silently
 * dropping the session. Returns `null` for a closed day (empty `windows`), which
 * the caller skips — no block on a day the center never opens.
 */
export function weeklyBlockInFittingWindow(
  dayOfWeek: WeekdayIndex,
  windows: readonly TimeWindow[],
  durationMinutes: number,
): WeeklyBlock | null {
  const fitsDuration = (window: TimeWindow): boolean =>
    toMinutes(window.close) - toMinutes(window.open) >= durationMinutes;
  const anchor = windows.find(fitsDuration) ?? windows[0];
  if (anchor === undefined) return null;
  return weeklyBlockFromOpen(dayOfWeek, anchor.open, durationMinutes);
}
