import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentInvoicesTab } from '../../../../src/renderer/components/student/student-invoices-tab';
import { invoicesGateway } from '../../../../src/renderer/lib/invoices/invoices-gateway';
import type { InvoiceListItemView } from '../../../../src/renderer/lib/invoices/invoice-view';
import type { StudentView } from '../../../../src/renderer/lib/students/student-view';
import { formatMoneyMad } from '../../../../src/renderer/lib/format';
import i18n from '../../../../src/renderer/i18n/config';

const STUDENT: StudentView = {
  id: 'stu_00000000000000000000000001',
  name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
  birthDate: '2010-03-14',
  level: '3AC',
  niveauId: null,
  school: null,
  notes: null,
  guardianIds: [],
  archived: false,
  createdAt: '2026-01-05T00:00:00.000Z',
  version: 1,
};

const INVOICE: InvoiceListItemView = {
  id: 'inv_00000000000000000000000001',
  studentId: STUDENT.id,
  month: '2026-08',
  status: 'draft',
  issuedAt: null,
  lines: [
    {
      id: 'invl_00000000000000000000000001',
      formulaId: 'for_00000000000000000000000001',
      label: { fr: 'Math seul', ar: 'رياضيات فقط' },
      kind: 'regular',
      amountMad: 20000,
    },
  ],
  totalMad: 20000,
  netPaidMad: 0,
  outstandingMad: 20000,
  paymentStatus: 'unpaid',
};

// A throwaway router with a dummy /invoicing/$invoiceId target so the row's
// <Link> resolves — mirroring dashboard-page.test.tsx's pattern.
function renderTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rootRoute = createRootRoute({ component: () => <StudentInvoicesTab student={STUDENT} /> });
  const invoiceDetail = createRoute({
    getParentRoute: () => rootRoute,
    path: '/invoicing/$invoiceId',
    component: () => null,
  });
  const routeTree = rootRoute.addChildren([invoiceDetail]);
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('StudentInvoicesTab', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists the student invoices (month, total MAD, payment status) filtered by studentId', async () => {
    const spy = vi.spyOn(invoicesGateway, 'list').mockResolvedValue([INVOICE]);
    renderTab();

    expect(await screen.findByText('août 2026')).toBeInTheDocument();
    // Intl separates with narrow no-break spaces; compare whitespace-normalized.
    const expectedTotal = formatMoneyMad(20000, 'fr').replace(/\s/g, ' ');
    expect(
      screen.getByText((text) => text.replace(/\s/g, ' ') === expectedTotal),
    ).toBeInTheDocument();
    expect(screen.getByText('Non payée')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith({ studentId: STUDENT.id });
  });

  it('navigates to the invoice detail when a row is clicked', async () => {
    vi.spyOn(invoicesGateway, 'list').mockResolvedValue([INVOICE]);
    const user = userEvent.setup();
    const router = renderTab();

    await user.click(await screen.findByRole('link', { name: /Yassine Alaoui/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/invoicing/${INVOICE.id}`));
  });

  it('shows the student-specific empty state when there is no invoice yet', async () => {
    vi.spyOn(invoicesGateway, 'list').mockResolvedValue([]);
    renderTab();

    expect(await screen.findByText("Aucune facture pour l'instant")).toBeInTheDocument();
    expect(
      screen.getByText("Les factures de l'élève apparaîtront ici dès la première facturation."),
    ).toBeInTheDocument();
  });

  it('shows the shared error state with a retry when the read fails', async () => {
    const spy = vi.spyOn(invoicesGateway, 'list').mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderTab();

    expect(await screen.findByText('Chargement impossible')).toBeInTheDocument();

    spy.mockResolvedValue([INVOICE]);
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('août 2026')).toBeInTheDocument();
  });
});
