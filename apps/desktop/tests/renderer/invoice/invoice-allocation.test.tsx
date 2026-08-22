import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PLANS } from '@centresoutien/domain';
import { InvoiceAllocationCard } from '../../../src/renderer/components/invoice/invoice-allocation-card';
import { invoicesGateway } from '../../../src/renderer/lib/invoices/invoices-gateway';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import type { InvoiceListItemView, InvoiceSubjectAllocation } from '../../../src/renderer/lib/invoices/invoice-view';
import i18n from '../../../src/renderer/i18n/config';

const MATH = { id: 'sub_01ARZ3NDEKTSV4RRFFQ69G5FAV', name: { fr: 'Mathématiques', ar: 'الرياضيات' }, code: 'MATH', active: true };
const PHYS = { id: 'sub_01ARZ3NDEKTSV4RRFFQ69G5FB0', name: { fr: 'Physique', ar: 'الفيزياء' }, code: 'PHYS', active: true };
const FORMULA_ID = 'for_01ARZ3NDEKTSV4RRFFQ69G5FAV';

const FORMULA = {
  id: FORMULA_ID,
  name: { fr: 'Math + Physique', ar: '' },
  subjectIds: [MATH.id, PHYS.id],
  priceMad: 35000,
  kind: 'regular',
  isImmutable: false,
  active: true,
  subjectPrices: [
    { subjectId: MATH.id, priceMad: 20000 },
    { subjectId: PHYS.id, priceMad: 15000 },
  ],
};

function invoice(subjectAllocation: readonly InvoiceSubjectAllocation[] | null): InvoiceListItemView {
  return {
    id: 'inv_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    studentId: 'stu_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    month: '2026-08',
    status: 'draft',
    issuedAt: null,
    lines: [{ id: 'invl_1', formulaId: FORMULA_ID, label: { fr: 'x', ar: 'x' }, kind: 'regular', amountMad: 35000 }],
    totalMad: 35000,
    netPaidMad: 0,
    outstandingMad: 35000,
    paymentStatus: 'unpaid',
    subjectAllocation,
  };
}

function renderCard(node: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('InvoiceAllocationCard gating', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    usePlanStore.setState({ planId: 'essentiel', plan: PLANS.essentiel });
  });

  it('is hidden when payroll.teacher is off', () => {
    usePlanStore.getState().setPlan('essentiel', []);
    renderCard(<InvoiceAllocationCard invoice={invoice(null)} />);
    expect(screen.queryByText('Répartition par matière')).not.toBeInTheDocument();
  });

  it('shows the weighted-default state when the allocation is null', () => {
    usePlanStore.getState().setPlan('premium');
    renderCard(<InvoiceAllocationCard invoice={invoice(null)} />);
    expect(screen.getByText('Répartition pondérée (par défaut)')).toBeInTheDocument();
  });
});

describe('InvoiceAllocationDialog', () => {
  beforeEach(async () => {
    window.api.invoke = vi.fn().mockImplementation((channel: string) => {
      if (channel === 'formula.list') return Promise.resolve({ formulas: [FORMULA] });
      if (channel === 'subject.list') return Promise.resolve({ subjects: [MATH, PHYS] });
      return Promise.resolve({});
    });
    usePlanStore.getState().setPlan('premium');
    await i18n.changeLanguage('fr');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    usePlanStore.setState({ planId: 'essentiel', plan: PLANS.essentiel });
  });

  async function openManualEditor(user: ReturnType<typeof userEvent.setup>, inv: InvoiceListItemView) {
    renderCard(<InvoiceAllocationCard invoice={inv} />);
    await user.click(screen.getByRole('button', { name: 'Configurer la répartition' }));
    await screen.findByRole('dialog');
  }

  it('pre-fills the manual editor from the formula price-map split', async () => {
    const user = userEvent.setup();
    await openManualEditor(user, invoice(null));

    await user.click(screen.getByLabelText('Répartition manuelle'));

    expect(await screen.findByLabelText('Mathématiques')).toHaveValue(200);
    expect(screen.getByLabelText('Physique')).toHaveValue(150);
  });

  it('saves a manual per-subject vector', async () => {
    const spy = vi.spyOn(invoicesGateway, 'setAllocation').mockResolvedValue(invoice([]));
    const user = userEvent.setup();
    await openManualEditor(user, invoice(null));

    await user.click(screen.getByLabelText('Répartition manuelle'));
    await screen.findByLabelText('Mathématiques');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][0]).toBe('inv_01ARZ3NDEKTSV4RRFFQ69G5FAV');
    expect(spy.mock.calls[0][1]).toEqual([
      { subjectId: MATH.id, amountMad: 20000 },
      { subjectId: PHYS.id, amountMad: 15000 },
    ]);
  });

  it('clears back to the weighted default (null) when manual is turned off', async () => {
    const spy = vi.spyOn(invoicesGateway, 'setAllocation').mockResolvedValue(invoice(null));
    const user = userEvent.setup();
    await openManualEditor(
      user,
      invoice([
        { subjectId: MATH.id, amountMad: 20000 },
        { subjectId: PHYS.id, amountMad: 15000 },
      ]),
    );

    // Existing manual allocation → the toggle starts on; turning it off clears.
    await user.click(screen.getByLabelText('Répartition manuelle'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][1]).toBeNull();
  });

  it('shows a non-blocking hint when the entered sum differs from the invoice total, and still saves', async () => {
    const spy = vi.spyOn(invoicesGateway, 'setAllocation').mockResolvedValue(invoice([]));
    const user = userEvent.setup();
    await openManualEditor(user, invoice(null));

    await user.click(screen.getByLabelText('Répartition manuelle'));
    const math = await screen.findByLabelText('Mathématiques');
    await user.clear(math);
    await user.type(math, '500');

    expect(
      screen.getByText('La somme peut différer du total facturé : les montants servent de pondération.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][1]).toEqual([
      { subjectId: MATH.id, amountMad: 50000 },
      { subjectId: PHYS.id, amountMad: 15000 },
    ]);
  });
});
