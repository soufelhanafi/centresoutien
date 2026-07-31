import type { StudentSubscription } from '../entities/student-subscription';
import type { SubjectId } from '../entities/subject';
import type { GroupKind } from '../entities/group';
import type { ActiveSubscriptionCoverage } from '../ports/student-subscription-reference';

/**
 * Pure month-range logic shared by the create-invariant guard and the coverage
 * adapter. All months are `YYYY-MM` strings, so lexicographic comparison is
 * chronological. An open-ended subscription (`endMonth: null`) is treated as
 * reaching an unbounded future via {@link OPEN_ENDED_SENTINEL}, which sorts after
 * any real month.
 */

/** Sorts strictly after any real `YYYY-MM` (months are `00`–`12`, years ≤ `9999`). */
const OPEN_ENDED_SENTINEL = '9999-99';

function upperBound(endMonth: string | null): string {
  return endMonth ?? OPEN_ENDED_SENTINEL;
}

/**
 * True when the subscription is active for `month` (`YYYY-MM`): its start is on or
 * before the month and its end (if any) is on or after it. The derived-status rule,
 * in one place.
 */
export function isSubscriptionActiveInMonth(
  subscription: Pick<StudentSubscription, 'startMonth' | 'endMonth'>,
  month: string,
): boolean {
  return subscription.startMonth <= month && month <= upperBound(subscription.endMonth);
}

/** An inverted range (`end` before `start`) covers no month — a cancelled subscription. */
function isEmptyRange(start: string, end: string | null): boolean {
  return upperBound(end) < start;
}

/**
 * True when two closed/open month ranges overlap by at least one month. Used by the
 * at-most-one-active invariant — a candidate range that overlaps a live same-kind
 * subscription is rejected. Standard interval overlap: `aStart <= bEnd && bStart <= aEnd`,
 * with `null` ends widened to the open-ended sentinel.
 *
 * An **empty (inverted) range** — `endMonth` before `startMonth`, the zero-month full
 * cancellation `CloseStudentSubscription` intentionally allows — covers no month, so
 * it can never overlap. Both sides are checked, keeping this consistent with
 * {@link isSubscriptionActiveInMonth} (which reports such a row inactive for every month).
 */
export function subscriptionRangesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  if (isEmptyRange(aStart, aEnd) || isEmptyRange(bStart, bEnd)) return false;
  return aStart <= upperBound(bEnd) && bStart <= upperBound(aEnd);
}

/**
 * The active coverage a set of the student's **live** subscriptions provides for
 * `subjectId` in `month`, or `null` when none covers it. Backs the
 * `StudentSubscriptionReferencePort.activeCoverage` adapter that `EnrollStudent`
 * consumes. Coverage is answered from the frozen `subjectIds` snapshot on each
 * subscription — no Formula dereference.
 *
 * When several subscriptions cover the subject (a `regular` and an `exam-prep`
 * bundle both including it), `preferKind` disambiguates: a covering subscription of
 * that track is returned if one exists, otherwise the first covering subscription.
 * This is deliberately **prefer**, not filter — `EnrollStudent` distinguishes "no
 * covering subscription at all" (`null` → `EnrollmentSubscriptionMissingError`) from
 * "covered, but only by the wrong track" (returns the wrong `kind` →
 * `CrossKindEnrollmentError`). Filtering by kind would collapse those two into one
 * `null`. With `preferKind` set to the group's kind, a student holding both tracks
 * for the subject enrolls into either kind's group without a spurious cross-kind
 * error, while a wrong-only holder still trips the guard.
 */
export function findActiveCoverage(
  liveSubscriptions: readonly StudentSubscription[],
  subjectId: SubjectId,
  month: string,
  preferKind?: GroupKind,
): ActiveSubscriptionCoverage | null {
  const covering = liveSubscriptions.filter(
    (s) => isSubscriptionActiveInMonth(s, month) && s.subjectIds.includes(subjectId),
  );
  const match = covering.find((s) => s.kind === preferKind) ?? covering[0];
  return match ? { kind: match.kind } : null;
}
