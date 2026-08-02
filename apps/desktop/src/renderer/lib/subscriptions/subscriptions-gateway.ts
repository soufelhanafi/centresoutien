import type { SubscriptionInput, SubscriptionView } from './subscription-view';
import { ipcSubscriptionsGateway } from './ipc-subscriptions-gateway';

/**
 * The seam the StudentSubscription UI depends on (Dependency Inversion). Hooks
 * call this interface, never `window.api` directly, so the concrete adapter is
 * swappable in one place with no change to any component. `close` is the first
 * half of close-and-reopen (SOU-63/SOU-65); `create` is reused for both the
 * second half and a fresh subscribe when a track has no active subscription yet.
 */
export interface SubscriptionsGateway {
  list(studentId: string): Promise<readonly SubscriptionView[]>;
  create(input: SubscriptionInput): Promise<{ id: string }>;
  close(subscriptionId: string, endMonth: string): Promise<SubscriptionView>;
}

/** The active gateway: the real IPC adapter. */
export const subscriptionsGateway: SubscriptionsGateway = ipcSubscriptionsGateway;
