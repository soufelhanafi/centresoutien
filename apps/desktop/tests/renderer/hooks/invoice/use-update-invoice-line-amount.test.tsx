import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUpdateInvoiceLineAmount } from '../../../../src/renderer/hooks/invoice/use-update-invoice-line-amount';
import { dashboardKeys } from '../../../../src/renderer/hooks/dashboard/keys';
import { invoiceKeys } from '../../../../src/renderer/hooks/invoice/keys';
import { invoicesGateway } from '../../../../src/renderer/lib/invoices/invoices-gateway';
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

const MONEY_KEYS: readonly QueryKey[] = [dashboardKeys.basic, dashboardKeys.advanced, invoiceKeys.all];

// Narrow test double: the hook only reads `invoice.id` from the gateway result.
const INVOICE = { id: 'inv_00000000000000000000000001' } as InvoiceListItemView;
const INPUT = { invoiceId: INVOICE.id, lineId: 'invl_00000000000000000000000001', amountMad: 25000 };

describe('useUpdateInvoiceLineAmount', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invalidates the invoice + dashboard money caches and patches the detail on success', async () => {
    vi.spyOn(invoicesGateway, 'updateLineAmount').mockResolvedValue(INVOICE);
    const client = newClient();
    for (const key of MONEY_KEYS) {
      client.setQueryData(key, { seeded: true });
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    }

    const { result } = renderHook(() => useUpdateInvoiceLineAmount(), { wrapper: wrapperFor(client) });
    await result.current.mutateAsync(INPUT);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    for (const key of MONEY_KEYS) {
      expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
    expect(client.getQueryData(invoiceKeys.detail(INVOICE.id))).toEqual(INVOICE);
    expect(invoicesGateway.updateLineAmount).toHaveBeenCalledWith(INPUT);
  });

  it('leaves the caches untouched when the write rejects (nothing was billed)', async () => {
    vi.spyOn(invoicesGateway, 'updateLineAmount').mockRejectedValue(new Error('invoice-not-draft'));
    const client = newClient();
    for (const key of MONEY_KEYS) {
      client.setQueryData(key, { seeded: true });
    }

    const { result } = renderHook(() => useUpdateInvoiceLineAmount(), { wrapper: wrapperFor(client) });
    await expect(result.current.mutateAsync(INPUT)).rejects.toThrow('invoice-not-draft');
    await waitFor(() => expect(result.current.isError).toBe(true));

    for (const key of MONEY_KEYS) {
      expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false);
    }
  });
});
