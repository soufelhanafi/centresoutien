import type { StudentSubscriptionInput } from '@centresoutien/domain';
import type { SubscriptionDto } from '../../../shared/ipc/contract';

/**
 * Presentation projection of a `StudentSubscription` as it crosses the IPC
 * boundary — the sync envelope is stripped and `Date`s serialized, exactly like
 * `GroupView`. A direct alias of the boundary's `subscriptionViewSchema` (the
 * single source of truth in `shared/ipc/contract`), so the renderer shape can
 * never drift from what `subscription.list` returns. There is no stored status:
 * active/closed is derived from `endMonth` against the current month.
 */
export type SubscriptionView = SubscriptionDto;

/** The fields captured when subscribing a student to a Formula — the domain's own schema. */
export type { StudentSubscriptionInput as SubscriptionInput };
