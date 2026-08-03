import type { WeekdayIndex } from '../value-objects/weekday';

const DAYS_IN_WEEK = 7;

/**
 * The gap, in days, between two consecutive sessions in a recurring weekly
 * pattern: the number of days from `fromDay` forward to `toDay` around the week.
 * Because a weekly pattern wraps, the meaningful distance between two weekdays is
 * measured over a circle of 7 — Monday→Thursday is 3, and the wrap
 * Friday→Monday is likewise 3 (not 4). SOU-158.
 */
export type WeekdayGap = {
  readonly fromDay: WeekdayIndex;
  readonly toDay: WeekdayIndex;
  readonly gapDays: number;
};

/**
 * The consecutive gaps around the week for a set of distinct weekdays, in
 * ascending-day order with the final wrap from the last day back to the first.
 * These are the only gaps that matter: the smallest distance between *any* two
 * days in a circular arrangement always falls between two neighbours in sorted
 * order, so checking neighbours is equivalent to checking every pair — matching
 * the ticket's "consecutive sessions only" rule with no blind spot. A set of
 * fewer than two days has no pair and yields no gaps. Duplicate inputs are
 * collapsed first, so a caller need not pre-dedupe.
 */
export function circularWeekdayGaps(weekdays: readonly WeekdayIndex[]): readonly WeekdayGap[] {
  const sorted = [...new Set(weekdays)].sort((a, b) => a - b);
  if (sorted.length < 2) return [];

  const gaps: WeekdayGap[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const fromDay = sorted[i] as WeekdayIndex;
    const isWrap = i === sorted.length - 1;
    const toDay = (isWrap ? sorted[0] : sorted[i + 1]) as WeekdayIndex;
    const forward = toDay - fromDay;
    gaps.push({ fromDay, toDay, gapDays: isWrap ? forward + DAYS_IN_WEEK : forward });
  }
  return gaps;
}

/**
 * True when every consecutive gap in the weekly pattern is at least
 * `minGapDays` — i.e. no two sessions of the same group land closer than the
 * required spacing. A single-session week trivially satisfies any gap.
 */
export function satisfiesMinGap(
  weekdays: readonly WeekdayIndex[],
  minGapDays: number,
): boolean {
  return circularWeekdayGaps(weekdays).every((gap) => gap.gapDays >= minGapDays);
}

/**
 * The consecutive gaps that fall short of `minGapDays` — the flags custom mode
 * surfaces without blocking (an admin may have a legitimate makeup-session
 * reason). Empty when the pattern honors the gap.
 */
export function gapViolations(
  weekdays: readonly WeekdayIndex[],
  minGapDays: number,
): readonly WeekdayGap[] {
  return circularWeekdayGaps(weekdays).filter((gap) => gap.gapDays < minGapDays);
}
