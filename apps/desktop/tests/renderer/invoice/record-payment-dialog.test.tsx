import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordPaymentDialog } from '../../../src/renderer/components/invoice/record-payment-dialog';
import i18n from '../../../src/renderer/i18n/config';
import * as paymentDay from '../../../src/renderer/lib/payments/today';

function newClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

describe('RecordPaymentDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    vi.spyOn(paymentDay, 'todayIso').mockReturnValue('2026-08-10');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults paidOn to the shared local payment day used by takings', () => {
    render(
      <QueryClientProvider client={newClient()}>
        <RecordPaymentDialog invoiceId="inv_00000000000000000000000001" outstandingMad={35000} open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText('Date du paiement')).toHaveValue('2026-08-10');
  });
});
