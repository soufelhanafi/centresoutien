import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

// Narrow test doubles: the hook only reads `invoice.id`, and the mutation input
// is passed straight to the mocked gateway, so a minimal shape is enough.
const INVOICE = { id: 'inv_00000000000000000000000001' } as InvoiceListItemView;
const INPUT = { invoiceId: INVOICE.id } as unknown as RecordPaymentInput;

describe('useRecordPayment', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invalidates the dashboard "Argent" keys on success so its money KPIs refresh (SOU-226)', async () => {
    vi.spyOn(invoicesGateway, 'recordPayment').mockResolvedValue(INVOICE);
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRecordPayment(), { wrapper: wrapperFor(client) });
    await result.current.mutateAsync(INPUT);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const invalidatedKeys = invalidateSpy.mock.calls.map(([arg]) => arg?.queryKey);
    expect(invalidatedKeys).toContainEqual(dashboardKeys.basic);
    expect(invalidatedKeys).toContainEqual(dashboardKeys.advanced);
    // The pre-existing invalidations must survive the SOU-226 addition.
    expect(invalidatedKeys).toContainEqual(invoiceKeys.all);
    expect(invalidatedKeys).toContainEqual(paymentKeys.all);
  });
});
