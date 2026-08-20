import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCreateSubscription } from '../../../../src/renderer/hooks/subscription/use-create-subscription';
import { subscriptionKeys } from '../../../../src/renderer/hooks/subscription/keys';
import { dashboardKeys } from '../../../../src/renderer/hooks/dashboard/keys';
import { invoiceKeys } from '../../../../src/renderer/hooks/invoice/keys';
import {
  subscriptionsGateway,
  type SubscriptionCreateResult,
} from '../../../../src/renderer/lib/subscriptions/subscriptions-gateway';
import type { SubscriptionInput } from '../../../../src/renderer/lib/subscriptions/subscription-view';

function newClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const STUDENT_ID = 'stu_00000000000000000000000001';
const RESULT: SubscriptionCreateResult = {
  id: 'sub_00000000000000000000000001',
  invoiceOutcome: 'created',
  invoiceId: 'inv_00000000000000000000000001',
};
// The mutation input is passed straight to the mocked gateway; a minimal shape is enough.
const INPUT = { studentId: STUDENT_ID } as unknown as SubscriptionInput;

describe('useCreateSubscription', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invalidates the subscription list, invoices, and dashboard money caches (SOU-289)', async () => {
    vi.spyOn(subscriptionsGateway, 'create').mockResolvedValue(RESULT);
    const client = newClient();
    const keys: readonly QueryKey[] = [
      subscriptionKeys.list(STUDENT_ID),
      invoiceKeys.all,
      dashboardKeys.basic,
      dashboardKeys.advanced,
    ];
    for (const key of keys) {
      client.setQueryData(key, { seeded: true });
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    }

    const { result } = renderHook(() => useCreateSubscription(STUDENT_ID), {
      wrapper: wrapperFor(client),
    });
    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual(RESULT);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    for (const key of keys) {
      expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
  });
});
