import { render, screen, act, waitFor, within } from '@testing-library/react';
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
import { useDashboardWidgetsStore } from '../../../src/renderer/stores/dashboard-widgets-store';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import { studentsModule, invoicingModule, planningModule } from '../../../src/renderer/app/nav-items';
import i18n from '../../../src/renderer/i18n/config';
import { planWithout } from '../fakes/plan';

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

async function openCustomize(user: ReturnType<typeof userEvent.setup>) {
  // The router mounts async; find (retries) rather than get.
  await user.click(await screen.findByRole('button', { name: 'Personnaliser le tableau de bord' }));
  await screen.findByText('Widgets du tableau de bord');
}

/** Close the sheet so the (previously aria-hidden) dashboard is queryable again. */
async function closeCustomize(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Fermer' }));
}

/** DOM order helper: true when `before` renders earlier than `after`. */
function rendersBefore(before: Element, after: Element): boolean {
  return (before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  localStorage.clear();
  act(() => {
    useDashboardViewStore.setState({ view: 'basic' });
    useDashboardWidgetsStore.setState({ prefs: null });
    usePlanStore.setState({ planId: 'essentiel', plan: PLANS.essentiel });
  });
});

describe('DashboardCustomizeSheet (SOU-231)', () => {
  it('opens from the gear button and lists both panels with every widget', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await openCustomize(user);

    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.getByRole('heading', { name: 'Vue Basique' })).toBeInTheDocument();
    expect(sheet.getByRole('heading', { name: 'Vue Avancée' })).toBeInTheDocument();

    for (const label of [
      'Argent',
      'Effectifs',
      'Charge enseignants / semaine',
      'Séances cette semaine',
      'Actions rapides',
      "Évolution du chiffre d'affaires",
      'Évolution des inscriptions',
      'Taux de présence — ce mois-ci',
      'Répartition par matière',
      'Inscriptions & départs',
      'Assiduité au quotidien',
    ]) {
      expect(sheet.getByText(label)).toBeInTheDocument();
    }
  });

  it('hides a widget from the dashboard immediately and persists the choice', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole('heading', { name: 'Séances cette semaine' });
    await openCustomize(user);

    // Every widget starts visible, so the checkbox reads "Masquer …".
    await user.click(screen.getByRole('checkbox', { name: 'Masquer Séances cette semaine' }));
    await closeCustomize(user);

    expect(screen.queryByRole('heading', { name: 'Séances cette semaine' })).not.toBeInTheDocument();
    const prefs = useDashboardWidgetsStore.getState().prefs;
    expect(prefs?.find((preference) => preference.widgetId === 'seances')?.visible).toBe(false);
    const stored = JSON.parse(localStorage.getItem('centre-soutien.dashboard-widgets') ?? '{}');
    expect(stored.state.prefs.find((p: { widgetId: string }) => p.widgetId === 'seances')?.visible).toBe(false);
  });

  it('reorders widgets with the up buttons, and the dashboard follows', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole('heading', { name: 'Séances cette semaine' });
    await openCustomize(user);

    await user.click(screen.getByRole('button', { name: 'Monter Séances cette semaine' }));
    await user.click(screen.getByRole('button', { name: 'Monter Séances cette semaine' }));
    await closeCustomize(user);

    const seances = screen.getByRole('heading', { name: 'Séances cette semaine' });
    const effectifs = screen.getByRole('heading', { name: 'Effectifs' });
    expect(rendersBefore(seances, effectifs)).toBe(true);
    expect(useDashboardWidgetsStore.getState().prefs?.[1]?.widgetId).toBe('seances');
  });

  it('disables the reorder buttons at the panel edges', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await openCustomize(user);

    expect(screen.getByRole('button', { name: 'Monter Argent' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descendre Actions rapides' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Monter Effectifs' })).not.toBeDisabled();
  });

  it('reset restores every widget to defaults', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole('heading', { name: 'Séances cette semaine' });
    await openCustomize(user);

    await user.click(screen.getByRole('checkbox', { name: 'Masquer Séances cette semaine' }));
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    await closeCustomize(user);

    expect(screen.getByRole('heading', { name: 'Séances cette semaine' })).toBeInTheDocument();
    expect(useDashboardWidgetsStore.getState().prefs).toBeNull();
  });

  it('shows the gated Avancé widgets with their premium badge in the checklist', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await openCustomize(user);

    expect(screen.getAllByText('PREMIUM')).toHaveLength(6);
  });

  it('shows the all-hidden empty state when every Basique widget is off', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole('heading', { name: 'Séances cette semaine' });
    await openCustomize(user);

    for (const label of ['Argent', 'Effectifs', 'Charge enseignants / semaine', 'Séances cette semaine', 'Actions rapides']) {
      await user.click(screen.getByRole('checkbox', { name: `Masquer ${label}` }));
    }
    await closeCustomize(user);

    expect(screen.getByText('Tous les widgets sont masqués.')).toBeInTheDocument();
  });
});

describe('DashboardAdvancedPanel — per-widget plan gating (SOU-231)', () => {
  it('renders a lock overlay + upgrade CTA for every visible widget on a locked plan', async () => {
    act(() => {
      usePlanStore.setState({ planId: 'essentiel', plan: planWithout('dashboard.advanced') });
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('tab', { name: 'Avancé' }));

    expect(await screen.findAllByText('Réservé à un plan supérieur')).toHaveLength(6);
    expect(screen.getAllByText('Débloquer avec Premium')).toHaveLength(6);
  });

  it('renders the real widgets on a plan with dashboard.advanced', async () => {
    act(() => {
      usePlanStore.setState({ planId: 'premium', plan: PLANS.premium });
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('tab', { name: 'Avancé' }));

    expect(await screen.findByText("Évolution du chiffre d'affaires")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Réservé à un plan supérieur')).not.toBeInTheDocument());
  });
});
