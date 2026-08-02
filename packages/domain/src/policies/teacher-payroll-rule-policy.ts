import type { TeacherPayrollRule } from '../entities/teacher-payroll-rule';

/**
 * Pure month-range logic for payroll rules — mirrors {@link
 * import('./student-subscription-policy')} exactly, applied to the
 * at-most-one-active-per-teacher invariant instead of per-(student, kind). All
 * months are `YYYY-MM` strings, so lexicographic comparison is chronological.
 * An open-ended rule (`endMonth: null`) reaches an unbounded future via
 * {@link OPEN_ENDED_SENTINEL}, which sorts after any real month.
 */

/** Sorts strictly after any real `YYYY-MM` (months are `00`–`12`, years ≤ `9999`). */
const OPEN_ENDED_SENTINEL = '9999-99';

function upperBound(endMonth: string | null): string {
  return endMonth ?? OPEN_ENDED_SENTINEL;
}

/**
 * True when the rule is active for `month` (`YYYY-MM`): its start is on or
 * before the month and its end (if any) is on or after it. The derived-status
 * rule, in one place.
 */
export function isPayrollRuleActiveInMonth(
  rule: Pick<TeacherPayrollRule, 'startMonth' | 'endMonth'>,
  month: string,
): boolean {
  return rule.startMonth <= month && month <= upperBound(rule.endMonth);
}

/** An inverted range (`end` before `start`) covers no month — a cancelled rule. */
function isEmptyRange(start: string, end: string | null): boolean {
  return upperBound(end) < start;
}

/**
 * True when two closed/open month ranges overlap by at least one month. Used by
 * the at-most-one-active invariant — a candidate range that overlaps an
 * existing live rule for the same teacher is rejected. Standard interval
 * overlap: `aStart <= bEnd && bStart <= aEnd`, with `null` ends widened to the
 * open-ended sentinel.
 *
 * An **empty (inverted) range** — `endMonth` before `startMonth`, the zero-month
 * full cancellation `CloseTeacherPayrollRule` intentionally allows — covers no
 * month, so it can never overlap. Both sides are checked, keeping this
 * consistent with {@link isPayrollRuleActiveInMonth}.
 */
export function payrollRuleRangesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  if (isEmptyRange(aStart, aEnd) || isEmptyRange(bStart, bEnd)) return false;
  return aStart <= upperBound(bEnd) && bStart <= upperBound(aEnd);
}
