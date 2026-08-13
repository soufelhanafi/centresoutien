import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRecordPayment } from '../../../../src/renderer/hooks/invoice/use-record-payment';
import { dashboardKeys } from '../../../../src/renderer/hooks/dashboard/keys';
import { invoiceKeys } from '../../../../src/renderer/hooks/invoice/keys';
import { paymentKeys } from '../../../../src/renderer/hooks/payments/keys';
import { invoicesGateway, type RecordPaymentInput } from '../../../../src/renderer/lib/invoices/invoices-gateway';
import type { InvoiceListItemView } from '../../../../src/renderer/lib/invoices/invoice-view';

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

const MONEY_KEYS: readonly QueryKey[] = [
  dashboardKeys.basic,
  dashboardKeys.advanced,
  invoiceKeys.all,
  paymentKeys.all,
];

// Seed each money cache as a fresh, non-invalidated success so we can observe the
// hook flip it to `isInvalidated` — an outcome on the cache, not a mock call arg.
function seedFreshMoneyCaches(client: QueryClient): void {
  for (const key of MONEY_KEYS) {
    client.setQueryData(key, { seeded: true });
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  }
}

function assertMoneyCachesInvalidated(client: QueryClient): void {
  for (const key of MONEY_KEYS) {
    expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
  }
}

// Narrow test doubles: the hook only reads `invoice.id`, and the mutation input
// is passed straight to the mocked gateway, so a minimal shape is enough.
const INVOICE = { id: 'inv_00000000000000000000000001' } as InvoiceListItemView;
const INPUT = { invoiceId: INVOICE.id } as unknown as RecordPaymentInput;

describe('useRecordPayment', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invalidates the invoice, payment, and dashboard "Argent" caches on success (SOU-226)', async () => {
    vi.spyOn(invoicesGateway, 'recordPayment').mockResolvedValue(INVOICE);
    const client = newClient();
    seedFreshMoneyCaches(client);

    const { result } = renderHook(() => useRecordPayment(), { wrapper: wrapperFor(client) });
    await result.current.mutateAsync(INPUT);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    assertMoneyCachesInvalidated(client);
    expect(client.getQueryData(invoiceKeys.detail(INVOICE.id))).toEqual(INVOICE);
  });

  it('still invalidates the money caches when the payment write rejects (onSettled, SOU-226)', async () => {
    // A rejection can still mean the ledger moved on another device (SOU-233 race),
    // so the stale local views must refetch either way — invalidation runs onSettled.
    vi.spyOn(invoicesGateway, 'recordPayment').mockRejectedValue(new Error('payment-conflict'));
    const client = newClient();
    seedFreshMoneyCaches(client);

    const { result } = renderHook(() => useRecordPayment(), { wrapper: wrapperFor(client) });
    await expect(result.current.mutateAsync(INPUT)).rejects.toThrow('payment-conflict');
    await waitFor(() => expect(result.current.isError).toBe(true));

    assertMoneyCachesInvalidated(client);
  });
});
