import type { PlannerSessionView } from './planner-view';

/** Default visible window when the week is empty: 08:00 → 20:00. */
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;

/** `'HH:mm'` → minutes since midnight (`'09:30'` → 570). */
export function timeToMinutes(time: string): number {
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  return hours * 60 + minutes;
}

/** The vertical span the grid renders, as whole hours. */
export type TimeRange = {
  /** First visible hour (0–23), floored from the earliest session start. */
  readonly startHour: number;
  /** Last visible hour boundary (1–24), ceiled from the latest session end. */
  readonly endHour: number;
  /** The hour labels down the gutter, e.g. `[8, 9, … 20]`. */
  readonly hours: readonly number[];
};

/**
 * Derives the visible time window from the week's sessions: floor the earliest
 * start and ceil the latest end to whole hours, falling back to the default
 * 08:00–20:00 window when there are no sessions. Keeping it session-driven means
 * an early 08:00 class or a late 18:30 one is never clipped.
 */
export function deriveTimeRange(sessions: readonly PlannerSessionView[]): TimeRange {
  let startHour = DEFAULT_START_HOUR;
  let endHour = DEFAULT_END_HOUR;

  if (sessions.length > 0) {
    let minStart = Number.POSITIVE_INFINITY;
    let maxEnd = Number.NEGATIVE_INFINITY;
    for (const s of sessions) {
      minStart = Math.min(minStart, timeToMinutes(s.start));
      maxEnd = Math.max(maxEnd, timeToMinutes(s.end));
    }
    startHour = Math.min(DEFAULT_START_HOUR, Math.floor(minStart / 60));
    endHour = Math.max(DEFAULT_END_HOUR, Math.ceil(maxEnd / 60));
  }

  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h += 1) hours.push(h);
  return { startHour, endHour, hours };
}

/** A block's vertical placement inside its day column, as percentages of height. */
export type BlockPosition = {
  readonly topPercent: number;
  readonly heightPercent: number;
};

/**
 * Positions a session vertically within the range: `top` and `height` as a
 * percentage of the column height, so the block scales with any row height the
 * grid chooses. Horizontal placement (which day, RTL mirroring) is the grid's
 * job, not this function's.
 */
export function blockPosition(session: PlannerSessionView, range: TimeRange): BlockPosition {
  const rangeStart = range.startHour * 60;
  const totalMinutes = (range.endHour - range.startHour) * 60;
  const top = ((timeToMinutes(session.start) - rangeStart) / totalMinutes) * 100;
  const height = ((timeToMinutes(session.end) - timeToMinutes(session.start)) / totalMinutes) * 100;
  return { topPercent: top, heightPercent: height };
}
