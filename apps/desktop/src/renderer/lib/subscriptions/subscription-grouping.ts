import { isSubscriptionActiveInMonth, type GroupKind } from '@centresoutien/domain';
import type { SubscriptionView } from './subscription-view';

/** At most one live subscription per kind (domain invariant), or `null` if none. */
export type ActiveSubscriptionsByKind = Readonly<Record<GroupKind, SubscriptionView | null>>;

/**
 * Splits a student's live subscriptions into the Active slot per kind and the
 * History list, using the domain's own {@link isSubscriptionActiveInMonth} so the
 * derived-status rule (CLAUDE.md §7) is never re-implemented here. History is
 * sorted most-recent-start first.
 */
export function partitionSubscriptions(
  subscriptions: readonly SubscriptionView[],
  month: string,
): { activeByKind: ActiveSubscriptionsByKind; history: readonly SubscriptionView[] } {
  const activeByKind: Record<GroupKind, SubscriptionView | null> = {
    regular: null,
    'exam-prep': null,
  };
  const history: SubscriptionView[] = [];

  for (const subscription of subscriptions) {
    if (isSubscriptionActiveInMonth(subscription, month)) {
      activeByKind[subscription.kind] = subscription;
    } else {
      history.push(subscription);
    }
  }

  return {
    activeByKind,
    history: [...history].sort((a, b) => (a.startMonth < b.startMonth ? 1 : -1)),
  };
}
