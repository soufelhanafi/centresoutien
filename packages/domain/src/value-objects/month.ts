import { daysInMonth } from './date-range';
import type { DateRange } from './date-range';

/**
 * Pure month arithmetic on `YYYY-MM` strings — the same lexicographic-comparison
 * convention {@link import('../policies/student-subscription-policy').isSubscriptionActiveInMonth}
 * relies on. No `Date`, no timezone: months are strings, not calendar objects.
 */

function parts(month: string): { year: number; month: number } {
  return { year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) };
}

function format(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/**
 * The `count` months ending at (and including) `endMonth`, oldest first —
 * SOU-100's 6-month trend windows (revenue, enrollment). Absolute-month-index
 * arithmetic (not repeated subtraction) so year rollover is correct without a
 * loop-carried borrow, and negative intermediate indices (an `endMonth` near
 * year 0000) still floor-divide to a valid month rather than going negative.
 */
export function monthsEndingAt(endMonth: string, count: number): readonly string[] {
  const { year, month } = parts(endMonth);
  const endIndex = year * 12 + (month - 1);
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const index = endIndex - i;
    const y = Math.floor(index / 12);
    const m = index - y * 12 + 1;
    months.push(format(y, m));
  }
  return months;
}

/** The full calendar-month `DateRange` for `month` (`YYYY-MM`) — day 1 through the month's last day. */
export function monthDateRange(month: string): DateRange {
  const { year, month: m } = parts(month);
  const lastDay = String(daysInMonth(year, m)).padStart(2, '0');
  return { start: `${month}-01`, end: `${month}-${lastDay}` };
}

/**
 * Signed whole-month difference `toMonth − fromMonth` (positive when `toMonth`
 * is later) — the shared absolute-month-index arithmetic behind
 * `monthsEndingAt` and the invoice-aging policy's `monthsOverdue`.
 */
export function monthsBetween(fromMonth: string, toMonth: string): number {
  const a = parts(fromMonth);
  const b = parts(toMonth);
  return b.year * 12 + (b.month - 1) - (a.year * 12 + (a.month - 1));
}

/** The `YYYY-MM` one month before `month` — the month a close caps at when a
 * replacement starts on `month` (close-and-reopen, CLAUDE.md §6/§7). Pure
 * absolute-month-index arithmetic so year rollover (e.g. `2026-01` → `2025-12`)
 * is correct, mirroring `monthsEndingAt`/`monthsBetween`. */
export function previousMonth(month: string): string {
  const { year, month: m } = parts(month);
  const index = year * 12 + (m - 1) - 1;
  const y = Math.floor(index / 12);
  const mm = index - y * 12 + 1;
  return format(y, mm);
}
