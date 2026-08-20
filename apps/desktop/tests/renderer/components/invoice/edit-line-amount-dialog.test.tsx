import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditLineAmountDialog } from '../../../../src/renderer/components/invoice/edit-line-amount-dialog';
import { InvoiceLineTable } from '../../../../src/renderer/components/invoice/invoice-line-table';
import { invoicesGateway } from '../../../../src/renderer/lib/invoices/invoices-gateway';
import type { InvoiceLineView, InvoiceListItemView } from '../../../../src/renderer/lib/invoices/invoice-view';
import i18n from '../../../../src/renderer/i18n/config';

const INVOICE_ID = 'inv_00000000000000000000000001';
const LINE: InvoiceLineView = {
  id: 'invl_00000000000000000000000001',
  formulaId: 'for_00000000000000000000000001',
  label: { fr: 'Math seul', ar: 'رياضيات فقط' },
  kind: 'regular',
  amountMad: 20000,
};

function invoiceWith(status: InvoiceListItemView['status']): InvoiceListItemView {
  return {
    id: INVOICE_ID,
    studentId: 'stu_00000000000000000000000001',
    month: '2026-08',
    status,
    issuedAt: status === 'issued' ? '2026-08-01T00:00:00.000Z' : null,
    lines: [LINE],
    totalMad: 20000,
    netPaidMad: 0,
    outstandingMad: 20000,
    paymentStatus: 'unpaid',
  };
}

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('EditLineAmountDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pre-fills the current amount in MAD and submits the new amount in centimes', async () => {
    const updated = { ...invoiceWith('draft'), totalMad: 30000, outstandingMad: 30000 };
    const spy = vi.spyOn(invoicesGateway, 'updateLineAmount').mockResolvedValue(updated);
    const user = userEvent.setup();
    renderWithClient(<EditLineAmountDialog invoiceId={INVOICE_ID} line={LINE} onClose={() => {}} />);

    const amount = screen.getByLabelText('Nouveau montant (MAD)');
    expect(amount).toHaveValue(200);

    await user.clear(amount);
    await user.type(amount, '300');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(spy).toHaveBeenCalledWith({
      invoiceId: INVOICE_ID,
      lineId: LINE.id,
      amountMad: 30000,
    });
  });

  it('never sends a non-positive amount (schema blocks it client-side)', async () => {
    const spy = vi.spyOn(invoicesGateway, 'updateLineAmount');
    const user = userEvent.setup();
    renderWithClient(<EditLineAmountDialog invoiceId={INVOICE_ID} line={LINE} onClose={() => {}} />);

    const amount = screen.getByLabelText('Nouveau montant (MAD)');
    await user.clear(amount);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(spy).not.toHaveBeenCalled();
    expect(await screen.findByText('Montant invalide')).toBeInTheDocument();
  });
});

describe('InvoiceLineTable edit affordance', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('shows the per-line edit button on a draft invoice', () => {
    renderWithClient(<InvoiceLineTable invoice={invoiceWith('draft')} />);
    expect(
      screen.getByRole('button', { name: 'Modifier le montant de « Math seul »' }),
    ).toBeInTheDocument();
  });

  it.each(['issued', 'cancelled'] as const)('shows no edit affordance on an %s invoice', (status) => {
    renderWithClient(<InvoiceLineTable invoice={invoiceWith(status)} />);
    expect(screen.queryByRole('button', { name: /Modifier le montant/ })).not.toBeInTheDocument();
  });
});

describe('InvoiceLineGroup label locale ordering', () => {
  function expectSameLabelCell(primary: HTMLElement, secondary: HTMLElement): void {
    const cell = primary.closest('td');
    expect(cell).not.toBeNull();
    expect(secondary.closest('td')).toBe(cell);
  }

  function precedesInDom(first: HTMLElement, second: HTMLElement): boolean {
    return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  }

  it('leads with the French label in fr, Arabic as the secondary line below it', async () => {
    await i18n.changeLanguage('fr');
    renderWithClient(<InvoiceLineTable invoice={invoiceWith('issued')} />);

    const fr = screen.getByText('Math seul');
    const ar = screen.getByText('رياضيات فقط');
    expectSameLabelCell(fr, ar);
    expect(precedesInDom(fr, ar)).toBe(true);
  });

  it('leads with the Arabic label in ar, French as the secondary line below it', async () => {
    await i18n.changeLanguage('ar');
    renderWithClient(<InvoiceLineTable invoice={invoiceWith('issued')} />);

    const fr = screen.getByText('Math seul');
    const ar = screen.getByText('رياضيات فقط');
    expectSameLabelCell(fr, ar);
    expect(precedesInDom(ar, fr)).toBe(true);
    await i18n.changeLanguage('fr');
  });
});
