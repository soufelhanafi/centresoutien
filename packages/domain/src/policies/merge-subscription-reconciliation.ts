import type { ParentId } from '../entities/parent';
import type {
  StudentSubscription,
  StudentSubscriptionId,
} from '../entities/student-subscription';
import type { UserId } from '../value-objects/ids';
import { previousMonth } from '../value-objects/month';
import { subscriptionRangesOverlap } from './student-subscription-policy';

export type SubscriptionReconciliation = {
  /** The reconciled re-pointed subscriptions — overlapping loser-origin ones closed. */
  readonly subscriptions: readonly StudentSubscription[];
  /** The ids of the loser-origin subscriptions the merge had to close. */
  readonly closedSubscriptionIds: readonly StudentSubscriptionId[];
};

/**
 * Reconciles the re-pointed loser-origin subscriptions against the winner's own
 * live subscriptions so the winner never ends up with two billable subscriptions
 * of the same kind in any month from the merge month on (CLAUDE.md §7, M3).
 * Re-pointing the loser's open (`endMonth: null`) subscription onto a winner who
 * already holds an open same-kind one would violate the at-most-one-active-per-kind
 * invariant and make the monthly invoice generator bill twice.
 *
 * The loser-origin duplicate is closed via the close-and-reopen convention
 * (cap `endMonth`, never edited in place otherwise), and stays a closed row
 * pointing at the winner for history. Non-overlapping kinds (winner `regular`,
 * loser `exam-prep`) both survive active. Purely additive to the input — rows
 * that are already closed or don't overlap pass through untouched.
 *
 * **Which sub is closed, and at what month.** `endMonth` is inclusive, so the
 * retired row must never bill any month the kept coverage is already billing.
 * The kept coverage starts at the LATER of the merge month and the winner sub's
 * start — pre-merge months are two separate students' history and are left alone.
 * The loser-origin duplicate is capped at `previousMonth` of that coverage start:
 * when the winner already bills at the merge month the loser-origin closes before
 * the merge month (never double-bills it), and when the winner starts later the
 * loser-origin keeps billing until the month before the winner takes over (no
 * billing gap, no overlap). A cap that lands before the loser-origin's own start
 * month is an inverted range — the zero-month full cancellation the derived-status
 * rule permits (same convention as `CloseStudentSubscription`) — so a duplicate
 * that starts in the merge month is cancelled entirely rather than billed once.
 */
export function reconcileOverlappingSubscriptions(input: {
  repointedSubscriptions: readonly StudentSubscription[];
  winnerSubscriptions: readonly StudentSubscription[];
  mergeMonth: string; // 'YYYY-MM'
  now: Date;
  updatedBy: UserId;
}): SubscriptionReconciliation {
  const winnerOpen = input.winnerSubscriptions.filter((s) => s.endMonth === null);
  const closedSubscriptionIds: StudentSubscriptionId[] = [];
  const subscriptions = input.repointedSubscriptions.map((sub) => {
    if (sub.endMonth !== null) return sub;
    const overlappingWinner = earliestSameKindWinner(winnerOpen, sub);
    if (overlappingWinner === null) return sub;
    closedSubscriptionIds.push(sub.id);
    const coverageStart =
      overlappingWinner.startMonth > input.mergeMonth ? overlappingWinner.startMonth : input.mergeMonth;
    return {
      ...sub,
      endMonth: previousMonth(coverageStart),
      updatedAt: input.now,
      updatedBy: input.updatedBy,
    };
  });
  return { subscriptions, closedSubscriptionIds };
}

/**
 * The same-kind open winner subscription whose range overlaps `sub`, preferring
 * the earliest start — the one that begins billing first and therefore defines
 * when the loser-origin duplicate must stop. `null` when no winner sub of the
 * same kind overlaps (kinds differ, or ranges are disjoint).
 */
function earliestSameKindWinner(
  winnerOpen: readonly StudentSubscription[],
  sub: StudentSubscription,
): StudentSubscription | null {
  let earliest: StudentSubscription | null = null;
  for (const winner of winnerOpen) {
    if (winner.kind !== sub.kind) continue;
    if (!subscriptionRangesOverlap(sub.startMonth, sub.endMonth, winner.startMonth, winner.endMonth)) {
      continue;
    }
    if (earliest === null || winner.startMonth < earliest.startMonth) {
      earliest = winner;
    }
  }
  return earliest;
}

/**
 * The single audit-note builder for a student merge (M3 + M4): both the closed
 * duplicate subscriptions and the detached guardian links are recorded here, in
 * one string, so nothing the merge discards is silent. Dev-facing policy note
 * (French, matching the domain's working language) — never rendered directly.
 * `null` when there is nothing to record.
 */
export function buildMergeStudentsNote(input: {
  closedSubscriptionIds: readonly StudentSubscriptionId[];
  droppedGuardianIds: readonly ParentId[];
}): string | null {
  const parts: string[] = [];
  if (input.closedSubscriptionIds.length > 0) {
    parts.push(`abonnements doublons fermés: ${input.closedSubscriptionIds.join(', ')}`);
  }
  if (input.droppedGuardianIds.length > 0) {
    parts.push(`gardiens détachés: ${input.droppedGuardianIds.join(', ')}`);
  }
  return parts.length > 0 ? parts.join('; ') : null;
}
