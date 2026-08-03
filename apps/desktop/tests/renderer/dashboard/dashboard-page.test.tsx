import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
} from '@tanstack/react-router';
import { PLANS } from '@centresoutien/domain';
import { DashboardPage } from '../../../src/renderer/pages/dashboard/dashboard-page';
import { useDashboardViewStore } from '../../../src/renderer/stores/dashboard-view-store';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import { studentsModule, invoicingModule, planningModule } from '../../../src/renderer/app/nav-items';
import i18n from '../../../src/renderer/i18n/config';

// A throwaway router with dummy targets for the quick-action <Link>s so they
// resolve — we're testing the dashboard, not routing to those pages.
function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rootRoute = createRootRoute({ component: () => <DashboardPage /> });
  const targets = [studentsModule, invoicingModule, planningModule].map((module) =>
    createRoute({ getParentRoute: () => rootRoute, path: module.path, component: () => null }),
  );
  const routeTree = rootRoute.addChildren(targets);
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  localStorage.clear();
  act(() => {
    useDashboardViewStore.setState({ view: 'basic' });
    usePlanStore.setState({ planId: 'essentiel', plan: PLANS.essentiel });
  });
});

describe('DashboardPage — Basique / Avancé toggle', () => {
  it('defaults to the Basique tab', async () => {
    renderDashboard();
    expect(await screen.findByRole('tab', { name: 'Basique' })).toHaveAttribute('aria-selected', 'true');
  });

  it('switches instantly and persists the choice to localStorage', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('tab', { name: 'Avancé' }));

    expect(screen.getByRole('tab', { name: 'Avancé' })).toHaveAttribute('aria-selected', 'true');
    expect(useDashboardViewStore.getState().view).toBe('advanced');
    const stored = localStorage.getItem('centre-soutien.dashboard-view');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? '{}').state.view).toBe('advanced');
  });

  it('locks the Avancé pane on a plan without dashboard.advanced', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('tab', { name: 'Avancé' }));

    expect(screen.getByText('Réservé à un plan supérieur')).toBeInTheDocument();
  });

  it('unlocks the Avancé pane on a plan with dashboard.advanced', async () => {
    act(() => {
      usePlanStore.setState({ planId: 'premium', plan: PLANS.premium });
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('tab', { name: 'Avancé' }));

    expect(screen.queryByText('Réservé à un plan supérieur')).not.toBeInTheDocument();
  });

  it('renders the Basique KPI cards from the dashboard.basic summary', async () => {
    renderDashboard();

    expect(await screen.findByText("Séances aujourd'hui")).toBeInTheDocument();
    expect(screen.getByText('Élèves actifs')).toBeInTheDocument();
    expect(screen.getByText('Factures impayées')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('0')).not.toHaveLength(0));
  });
});
