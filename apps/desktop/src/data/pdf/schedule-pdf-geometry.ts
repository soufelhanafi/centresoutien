import { toMinutes, type TimeOfDay, type WeekdayIndex } from '@centresoutien/domain';
import type { ScheduleExportSessionRow } from './schedule-pdf-input';

const DEFAULT_START_MINUTES = 8 * 60;
const DEFAULT_END_MINUTES = 20 * 60;
const TIME_BOUNDS_PADDING_MINUTES = 30;
const WEEKDAY_COUNT = 7;

export const GRID_MARGIN = 28;
export const TIME_AXIS_WIDTH = 34;
export const HEADER_HEIGHT = 64;
export const DAY_HEADER_HEIGHT = 20;
export const FOOTER_HEIGHT = 16;

export type ScheduleTimeBounds = {
  readonly startMinutes: number;
  readonly endMinutes: number;
};

/**
 * The grid's vertical time range: the center's typical 08:00–20:00 span,
 * widened (with a half-hour margin) to fit any session that falls outside it —
 * a grid that silently clips a real session would be a worse defect than one
 * taller than strictly necessary.
 */
export function computeScheduleTimeBounds(
  sessions: readonly ScheduleExportSessionRow[],
): ScheduleTimeBounds {
  let startMinutes = DEFAULT_START_MINUTES;
  let endMinutes = DEFAULT_END_MINUTES;
  for (const session of sessions) {
    startMinutes = Math.min(startMinutes, toMinutes(session.start) - TIME_BOUNDS_PADDING_MINUTES);
    endMinutes = Math.max(endMinutes, toMinutes(session.end) + TIME_BOUNDS_PADDING_MINUTES);
  }
  return { startMinutes, endMinutes };
}

export type ScheduleGridGeometry = {
  readonly gridLeft: number;
  readonly gridRight: number;
  readonly gridTop: number;
  readonly gridBottom: number;
  readonly columnWidth: number;
  readonly timeBounds: ScheduleTimeBounds;
};

/** Pure geometry for the 7-day time grid — no `pdf-lib` dependency, so it is
 *  unit-testable as plain arithmetic. The time axis sits on the page's start
 *  edge, mirroring the on-screen grid: physical left for `fr`, physical right
 *  for `ar` (whose hour gutter is the RTL first column). `dayColumnIndex` flips
 *  the day order to match. */
export function computeGridGeometry(
  pageWidth: number,
  pageHeight: number,
  sessions: readonly ScheduleExportSessionRow[],
  locale: 'fr' | 'ar',
): ScheduleGridGeometry {
  const timeAxisOnLeft = locale === 'fr';
  const gridLeft = GRID_MARGIN + (timeAxisOnLeft ? TIME_AXIS_WIDTH : 0);
  const gridRight = pageWidth - GRID_MARGIN - (timeAxisOnLeft ? 0 : TIME_AXIS_WIDTH);
  const gridTop = pageHeight - GRID_MARGIN - HEADER_HEIGHT - DAY_HEADER_HEIGHT;
  const gridBottom = GRID_MARGIN + FOOTER_HEIGHT;
  return {
    gridLeft,
    gridRight,
    gridTop,
    gridBottom,
    columnWidth: (gridRight - gridLeft) / WEEKDAY_COUNT,
    timeBounds: computeScheduleTimeBounds(sessions),
  };
}

/** Column index for `dayOfWeek`, mirrored for `ar` so Sunday reads at the page's
 *  right edge and Saturday at its left — the grid's own RTL flip, independent of
 *  `drawAlignedText`'s per-string mirroring. */
export function dayColumnIndex(dayOfWeek: WeekdayIndex, locale: 'fr' | 'ar'): number {
  return locale === 'ar' ? WEEKDAY_COUNT - 1 - dayOfWeek : dayOfWeek;
}

export function dayColumnX(
  dayOfWeek: WeekdayIndex,
  geometry: ScheduleGridGeometry,
  locale: 'fr' | 'ar',
): number {
  return geometry.gridLeft + dayColumnIndex(dayOfWeek, locale) * geometry.columnWidth;
}

/** Vertical position of a wall-clock minute mark within the grid —
 *  `startMinutes` lands at `gridTop`, `endMinutes` at `gridBottom`, matching the
 *  live grid's top-to-bottom reading of a day. */
export function minutesToGridY(minutes: number, geometry: ScheduleGridGeometry): number {
  const { startMinutes, endMinutes } = geometry.timeBounds;
  const ratio = (minutes - startMinutes) / (endMinutes - startMinutes);
  return geometry.gridTop - ratio * (geometry.gridTop - geometry.gridBottom);
}

export function timeToGridY(time: TimeOfDay, geometry: ScheduleGridGeometry): number {
  return minutesToGridY(toMinutes(time), geometry);
}
