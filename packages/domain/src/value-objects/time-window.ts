import { fromMinutes, toMinutes, type TimeOfDay } from './time-of-day';

/**
 * A single opening interval within one day, in 24-hour `'HH:mm'` form
 * (`{ open: '09:00', close: '15:00' }`). Both ends are validated {@link TimeOfDay}
 * values; `close` is always strictly after `open` (no zero-length, no overnight —
 * a center day never crosses midnight, mirroring {@link TimeOfDay}). Introduced by
 * SOU-165 so a single weekday can carry *several* windows — e.g. a Ramadan
 * schedule that opens 09:00–15:00, closes for iftar, then reopens 21:00–23:00.
 */
export type TimeWindow = { readonly open: TimeOfDay; readonly close: TimeOfDay };

/** A window is well-formed when its `close` is strictly after its `open`. */
export function isValidTimeWindow(window: TimeWindow): boolean {
  return toMinutes(window.open) < toMinutes(window.close);
}

/**
 * Does `window` fully contain the range `[start, end]`? Boundaries are inclusive
 * — a session may start exactly at a window's `open` and end exactly at its
 * `close`, matching {@link SessionConflictPolicy.withinCenterHours}. The range is
 * trusted to be positive-duration (the caller runs the malformed-time check
 * first); this only asks whether it sits inside the window.
 */
export function timeWindowContains(window: TimeWindow, start: TimeOfDay, end: TimeOfDay): boolean {
  return toMinutes(window.open) <= toMinutes(start) && toMinutes(end) <= toMinutes(window.close);
}

/**
 * Do *any* of `windows` fully contain `[start, end]`? A session is accepted only
 * when it fits entirely inside one window — never across a gap (the iftar break),
 * which is exactly why a day needs several windows rather than one wide span.
 * Empty `windows` means the day is closed, so nothing fits.
 */
export function timeWindowsContain(
  windows: readonly TimeWindow[],
  start: TimeOfDay,
  end: TimeOfDay,
): boolean {
  return windows.some((window) => timeWindowContains(window, start, end));
}

/**
 * Is `windows` a valid per-day list: every window well-formed (`close > open`),
 * ordered by `open` ascending, and non-overlapping (each window's `open` at or
 * after the previous window's `close` — touching back-to-back is allowed, a
 * shared minute is not)? An empty list is valid and means "closed that day".
 * This is the ordered non-overlapping invariant the SOU-165 override schema and
 * entity both enforce, so a stored `hoursByWeekday` can be trusted downstream.
 */
export function areOrderedNonOverlappingWindows(windows: readonly TimeWindow[]): boolean {
  let previousClose = -1;
  for (const window of windows) {
    if (!isValidTimeWindow(window)) return false;
    const open = toMinutes(window.open);
    if (open < previousClose) return false;
    previousClose = toMinutes(window.close);
  }
  return true;
}

/**
 * The overlap of two ordered, non-overlapping window lists — used by the
 * session generator to restrict a day's opening windows down to the span a
 * given teacher is actually available in. A two-pointer sweep: each pair of
 * windows contributes `[max(open), min(close))` when that range is
 * positive-length. Either list empty (a closed day on either side) yields no
 * overlap.
 */
export function intersectTimeWindows(
  a: readonly TimeWindow[],
  b: readonly TimeWindow[],
): readonly TimeWindow[] {
  const overlaps: TimeWindow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const left = a[i]!;
    const right = b[j]!;
    const start = Math.max(toMinutes(left.open), toMinutes(right.open));
    const end = Math.min(toMinutes(left.close), toMinutes(right.close));
    if (start < end) overlaps.push({ open: fromMinutes(start), close: fromMinutes(end) });
    if (toMinutes(left.close) < toMinutes(right.close)) i += 1;
    else j += 1;
  }
  return overlaps;
}
