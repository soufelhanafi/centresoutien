import type { SubscriptionInput, SubscriptionView } from './subscription-view';
import { ipcSubscriptionsGateway } from './ipc-subscriptions-gateway';

/**
 * The seam the StudentSubscription UI depends on (Dependency Inversion). Hooks
 * call this interface, never `window.api` directly, so the concrete adapter is
 * swappable in one place with no change to any component.
 */
export interface SubscriptionsGateway {
  list(studentId: string): Promise<readonly SubscriptionView[]>;
  create(input: SubscriptionInput): Promise<{ id: string }>;
  close(subscriptionId: string, endMonth: string): Promise<SubscriptionView>;
  replace(
    input: SubscriptionInput,
    activeSubscriptionId: string,
  ): Promise<{ closed: SubscriptionView; created: SubscriptionView }>;
}

/** The active gateway: the real IPC adapter. */
export const subscriptionsGateway: SubscriptionsGateway = ipcSubscriptionsGateway;
