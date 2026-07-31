import type { HolidayView } from './holiday-view';

/** The active year filter: a concrete year, or `all` to show every holiday. */
export type HolidayYearFilter = number | 'all';

/** The Gregorian year a holiday's range starts in. */
export function holidayYear(holiday: HolidayView): number {
  return Number(holiday.startDate.slice(0, 4));
}

/**
 * Year filtering is presentation-only (the list channel returns every holiday):
 * a `fixed` holiday recurs on the same date **every** year, so it belongs to any
 * selected year; a `lunar` holiday belongs only to the year it was entered for.
 */
export function filterHolidaysByYear(
  holidays: readonly HolidayView[],
  year: HolidayYearFilter,
): readonly HolidayView[] {
  if (year === 'all') return holidays;
  return holidays.filter((h) => h.kind === 'fixed' || holidayYear(h) === year);
}

/**
 * The years offered in the filter, newest first: every year any holiday was
 * entered for, plus the current year (so a fresh center still has a real choice).
 */
export function holidayYearOptions(holidays: readonly HolidayView[], currentYear: number): readonly number[] {
  const years = new Set<number>([currentYear]);
  for (const holiday of holidays) years.add(holidayYear(holiday));
  return [...years].sort((a, b) => b - a);
}
