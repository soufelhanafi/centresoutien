import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useReversePayment } from '../../../src/renderer/hooks/invoice/use-reverse-payment';
import { ReversePaymentDialog } from '../../../src/renderer/components/invoice/reverse-payment-dialog';
import { PaymentHistoryList } from '../../../src/renderer/components/invoice/payment-history-list';
import type { PaymentView } from '../../../src/renderer/lib/invoices/payment-view';
import i18n from '../../../src/renderer/i18n/config';

function newClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function payment(overrides: Partial<PaymentView> & Pick<PaymentView, 'id'>): PaymentView {
  return {
    invoiceId: 'inv-1',
    kind: 'payment',
    amountMad: 20000,
    method: 'cash',
    paidOn: '2026-07-15',
    reversesPaymentId: null,
    note: null,
    createdAt: '2026-07-15T09:00:00.000Z',
    ...overrides,
  };
}

function summaryWith(payments: readonly PaymentView[]) {
  return {
    invoiceId: 'inv-1',
    totalMad: 40000,
    netPaidMad: 20000,
    outstandingMad: 20000,
    status: 'partially-paid',
    payments,
  };
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('payment reversal — cache invalidation (SOU-237)', () => {
  function Consumer({ queryKey, fetchCount }: { queryKey: readonly unknown[]; fetchCount: () => Promise<number> }) {
    const { data } = useQuery({ queryKey, queryFn: fetchCount });
    return <output aria-label={labelOf(queryKey)}>{data ?? 'loading'}</output>;
  }

  function labelOf(queryKey: readonly unknown[]): string {
    return queryKey.map((part) => (typeof part === 'object' ? 'filters' : String(part))).join(':');
  }

  function ReverseTrigger() {
    const reverse = useReversePayment();
    return (
      <button type="button" onClick={() => reverse.mutate('pay-1')}>
        reverse
      </button>
    );
  }

  function counter(): () => Promise<number> {
    let calls = 0;
    return () => Promise.resolve((calls += 1));
  }

  it('refetches invoices, payments, arrears, and both dashboard views after a reversal', async () => {
    window.api.invoke = vi.fn(async () => ({ id: 'rev-1' }));
    const families = [
      ['invoices', 'list', {}],
      ['payments', 'recent', {}],
      ['arrears', 'list', {}],
      ['dashboard', 'basic'],
      ['dashboard', 'advanced'],
    ] as const;

    render(
      <QueryClientProvider client={newClient()}>
        {families.map((key) => (
          <Consumer key={key.join(':')} queryKey={key} fetchCount={counter()} />
        ))}
        <ReverseTrigger />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      for (const key of families) expect(screen.getByLabelText(labelOf(key))).toHaveTextContent('1');
    });

    screen.getByRole('button', { name: 'reverse' }).click();

    await waitFor(() => {
      for (const key of families) expect(screen.getByLabelText(labelOf(key))).toHaveTextContent('2');
    });
  });
});

describe('payment reversal — history action (SOU-237)', () => {
  it('offers the reverse action only on a not-yet-reversed payment, and voids it on confirm', async () => {
    const payments = [
      payment({ id: 'pay-1' }),
      payment({ id: 'pay-2' }),
      payment({ id: 'rev-2', kind: 'reversal', reversesPaymentId: 'pay-2' }),
    ];
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'payment.void') return { id: 'rev-1' };
      return summaryWith(payments);
    });
    window.api.invoke = invoke;

    render(
      <QueryClientProvider client={newClient()}>
        <PaymentHistoryList invoiceId="inv-1" />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Annuler ce paiement' })).toHaveLength(1),
    );

    screen.getByRole('button', { name: 'Annuler ce paiement' }).click();

    const confirm = await screen.findByRole('button', { name: 'Annuler le paiement' });
    confirm.click();

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('payment.void', { paymentId: 'pay-1' }),
    );
  });
});

describe('payment reversal — double-click guard (SOU-237)', () => {
  function DialogHarness({ target }: { target: PaymentView }) {
    const [open, setOpen] = useState(true);
    return <ReversePaymentDialog payment={target} open={open} onOpenChange={setOpen} />;
  }

  it('disables confirm while the reversal is in flight so a second click cannot fire another void', async () => {
    let resolveVoid: (value: { id: string }) => void = () => {};
    const invoke = vi.fn((channel: string) => {
      if (channel === 'payment.void') return new Promise<{ id: string }>((resolve) => (resolveVoid = resolve));
      return Promise.resolve({});
    });
    window.api.invoke = invoke;

    render(
      <QueryClientProvider client={newClient()}>
        <DialogHarness target={payment({ id: 'pay-1' })} />
      </QueryClientProvider>,
    );

    const confirm = await screen.findByRole('button', { name: 'Annuler le paiement' });
    confirm.click();

    await waitFor(() => expect(confirm).toBeDisabled());
    confirm.click();

    const voidCalls = invoke.mock.calls.filter(([channel]) => channel === 'payment.void');
    expect(voidCalls).toHaveLength(1);

    resolveVoid({ id: 'rev-1' });
  });
});
