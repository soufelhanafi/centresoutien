import { type WeekdayHoursInput } from '@centresoutien/domain';
import { bcp47 } from '../format';
import type { PlannerSessionView } from './planner-view';

/** Default visible window when no day of the week is open: 08:00 → 20:00. */
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;

/** `'HH:mm'` → minutes since midnight (`'09:30'` → 570). */
export function timeToMinutes(time: string): number {
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  return hours * 60 + minutes;
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function getTimeFormatter(locale: string): Intl.DateTimeFormat {
  const cached = timeFormatters.get(locale);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(bcp47(locale), {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  });
  timeFormatters.set(locale, formatter);
  return formatter;
}

export function formatMinutesOfDay(minutes: number, locale: string): string {
  if (minutes === 24 * 60) return '24:00';
  return getTimeFormatter(locale).format(new Date(Date.UTC(1970, 0, 1, 0, minutes)));
}

export function formatTimeOfDay(time: string, locale: string): string {
  return formatMinutesOfDay(timeToMinutes(time), locale);
}

export function formatTimeRange(start: string, end: string, locale: string): string {
  return `${formatTimeOfDay(start, locale)} – ${formatTimeOfDay(end, locale)}`;
}

/** The vertical span the grid renders, as whole hours. */
export type TimeRange = {
  /** First visible hour (0–23), floored from the earliest opening time. */
  readonly startHour: number;
  /** Last visible hour boundary (1–24), ceiled from the latest closing time. */
  readonly endHour: number;
  /** The hour labels down the gutter, e.g. `[8, 9, … 20]`. */
  readonly hours: readonly number[];
};

/** The grid's minute-of-day bounds, spanning every open day of the week. */
export type GridBounds = {
  readonly start: number;
  readonly end: number;
};

/**
 * The grid's minute bounds: the earliest opening and the latest closing time
 * across every window of the week's open days. Closed days (no windows) are
 * excluded from the min/max; when no day is open the grid falls back to the
 * default 08:00–20:00 window. Sessions never extend the bounds — the grid shows
 * exactly what the center says it is open for (SOU-184).
 */
export function getGridBounds(week: readonly WeekdayHoursInput[]): GridBounds {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const row of week) {
    for (const window of row.windows) {
      start = Math.min(start, timeToMinutes(window.open));
      end = Math.max(end, timeToMinutes(window.close));
    }
  }
  if (start > end) return { start: DEFAULT_START_HOUR * 60, end: DEFAULT_END_HOUR * 60 };
  return { start, end };
}

/**
 * The visible hour window derived from the center's weekly hours: floor the
 * earliest open and ceil the latest close to whole hours, filling every hour in
 * between. A 22:00 closing stays visible even when no session is scheduled that
 * late (SOU-184). A close after 23:00 ceils to the end-of-day boundary hour 24.
 */
export function deriveCenterHoursRange(week: readonly WeekdayHoursInput[]): TimeRange {
  const { start, end } = getGridBounds(week);
  const startHour = Math.floor(start / 60);
  const endHour = Math.ceil(end / 60);
  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h += 1) hours.push(h);
  return { startHour, endHour, hours };
}

/** The day indexes whose rows are closed (no windows) and must render hatched in the grid. */
export function deriveClosedDays(week: readonly WeekdayHoursInput[]): ReadonlySet<number> {
  const closed = new Set<number>();
  for (const row of week) {
    if (row.windows.length === 0) closed.add(row.dayOfWeek);
  }
  return closed;
}

/** A half-open interval of minutes-since-midnight, `[start, end)`. */
export type MinuteInterval = {
  readonly start: number;
  readonly end: number;
};

/**
 * The closed intervals of a day: the complement of its open windows within the
 * grid's visible range. An empty `openWindows` yields the whole range (a fully
 * closed day); two windows with a lunch/iftar break yield the gap between them,
 * plus any time before the first open and after the last close (SOU-165). Inputs
 * need not be sorted — they are ordered by start here.
 */
export function complementWithinRange(
  openWindows: readonly MinuteInterval[],
  range: TimeRange,
): MinuteInterval[] {
  const rangeStart = range.startHour * 60;
  const rangeEnd = range.endHour * 60;
  const sorted = [...openWindows].sort((a, b) => a.start - b.start);
  const closed: MinuteInterval[] = [];
  let cursor = rangeStart;
  for (const window of sorted) {
    const start = Math.max(window.start, rangeStart);
    const end = Math.min(window.end, rangeEnd);
    if (start > cursor) closed.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  }
  if (cursor < rangeEnd) closed.push({ start: cursor, end: rangeEnd });
  return closed;
}

/** A block's vertical placement inside its day column, as percentages of height. */
export type BlockPosition = {
  readonly topPercent: number;
  readonly heightPercent: number;
};

/**
 * Positions a raw minute interval vertically within the range, as percentages of
 * the column height — the hatched-segment counterpart to {@link blockPosition}.
 * Both edges clamp to the visible window.
 */
export function segmentPosition(interval: MinuteInterval, range: TimeRange): BlockPosition {
  const rangeStart = range.startHour * 60;
  const rangeEnd = range.endHour * 60;
  const total = rangeEnd - rangeStart;
  const top = Math.min(100, Math.max(0, ((interval.start - rangeStart) / total) * 100));
  const bottom = Math.min(100, Math.max(0, ((interval.end - rangeStart) / total) * 100));
  return { topPercent: top, heightPercent: Math.max(0, bottom - top) };
}

/**
 * Positions a session vertically within the range, as a percentage of the
 * column height so blocks scale with any row height the grid chooses.
 * Horizontal placement (which day, RTL mirroring) is the grid's job. A session
 * straddling an edge clamps to it; one fully outside the range pins a minimum
 * 2% sliver to the nearest edge so it stays findable after the center narrows
 * its hours (SOU-184).
 */
export function blockPosition(session: PlannerSessionView, range: TimeRange): BlockPosition {
  const rangeStart = range.startHour * 60;
  const rangeEnd = range.endHour * 60;
  const totalMinutes = rangeEnd - rangeStart;
  const start = timeToMinutes(session.start);
  const end = timeToMinutes(session.end);

  if (end <= rangeStart || start >= rangeEnd) {
    const sliver = 2;
    return end <= rangeStart
      ? { topPercent: 0, heightPercent: sliver }
      : { topPercent: 100 - sliver, heightPercent: sliver };
  }

  const top = Math.min(100, Math.max(0, ((start - rangeStart) / totalMinutes) * 100));
  const bottom = Math.min(100, Math.max(0, ((end - rangeStart) / totalMinutes) * 100));
  return { topPercent: top, heightPercent: Math.max(0, bottom - top) };
}

/**
 * The gutter label for a whole-hour tick. The end-of-day boundary hour 24 stays
 * as `24:00`, so a 23:30 close still shows sessions up to that hour.
 */
export function hourLabel(hour: number, locale: string): string {
  return formatMinutesOfDay(hour * 60, locale);
}
