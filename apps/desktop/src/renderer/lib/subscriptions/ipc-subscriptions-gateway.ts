import type { SubscriptionInput, SubscriptionView } from './subscription-view';
import type { SubscriptionsGateway } from './subscriptions-gateway';

/**
 * The real {@link SubscriptionsGateway}: maps each method onto its typed IPC
 * channel (SOU-63 write channels, SOU-65 frontend). No business logic — the
 * domain use cases behind the channels own it.
 */
class IpcSubscriptionsGateway implements SubscriptionsGateway {
  async list(studentId: string): Promise<readonly SubscriptionView[]> {
    const { subscriptions } = await window.api.invoke('subscription.list', { studentId });
    return subscriptions;
  }

  async create(input: SubscriptionInput): Promise<{ id: string }> {
    return window.api.invoke('subscription.create', input);
  }

  async close(subscriptionId: string, endMonth: string): Promise<SubscriptionView> {
    const { subscription } = await window.api.invoke('subscription.close', {
      subscriptionId,
      endMonth,
    });
    return subscription;
  }

  async replace(
    input: SubscriptionInput,
    activeSubscriptionId: string,
  ): Promise<{ closed: SubscriptionView; created: SubscriptionView }> {
    return window.api.invoke('subscription.replace', { ...input, activeSubscriptionId });
  }
}

export const ipcSubscriptionsGateway: SubscriptionsGateway = new IpcSubscriptionsGateway();
