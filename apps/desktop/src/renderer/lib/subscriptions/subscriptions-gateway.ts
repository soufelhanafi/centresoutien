import type { SubscriptionInvoiceOutcome } from '@centresoutien/domain';
import type { SubscriptionInput, SubscriptionView } from './subscription-view';
import { ipcSubscriptionsGateway } from './ipc-subscriptions-gateway';

/**
 * What `subscription.create` reports back (SOU-289): the new subscription's id
 * plus the first-invoice hook's outcome — `invoiceId` is set when an invoice was
 * created or resolved (created / line-appended / already-billed / issued-skipped),
 * `null` when nothing was generated.
 */
export type SubscriptionCreateResult = {
  id: string;
  invoiceOutcome: SubscriptionInvoiceOutcome;
  invoiceId: string | null;
};

/**
 * The seam the StudentSubscription UI depends on (Dependency Inversion). Hooks
 * call this interface, never `window.api` directly, so the concrete adapter is
 * swappable in one place with no change to any component.
 */
export interface SubscriptionsGateway {
  list(studentId: string): Promise<readonly SubscriptionView[]>;
  create(input: SubscriptionInput): Promise<SubscriptionCreateResult>;
  close(subscriptionId: string, endMonth: string): Promise<SubscriptionView>;
  replace(
    input: SubscriptionInput,
    activeSubscriptionId: string,
  ): Promise<{ closed: SubscriptionView; created: SubscriptionView }>;
}

/** The active gateway: the real IPC adapter. */
export const subscriptionsGateway: SubscriptionsGateway = ipcSubscriptionsGateway;
