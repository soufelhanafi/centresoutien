import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Outlet,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PLANS } from '@centresoutien/domain';
import { Sidebar } from '../../src/renderer/components/shell/sidebar';
import { NAV_MODULES } from '../../src/renderer/app/nav-items';
import { usePlanStore } from '../../src/renderer/stores/plan-store';
import i18n from '../../src/renderer/i18n/config';
import { planWithout } from './fakes/plan';

// A throwaway router whose routes mirror NAV_MODULES so the sidebar's <Link>s
// resolve. We render the Sidebar, not the app router, to test gating in isolation.
function renderSidebar() {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Sidebar />
        <Outlet />
      </>
    ),
  });
  const children = NAV_MODULES.map((module) =>
    createRoute({ getParentRoute: () => rootRoute, path: module.path, component: () => null }),
  );
  const routeTree = rootRoute.addChildren(children);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
  });
  // The Sidebar renders the center logo (SOU-278), which reads `center.get` /
  // `center.logoBytes` through react-query — provide the client the app would.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('Sidebar — plan-gated navigation', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    usePlanStore.setState({ planId: 'essentiel', plan: PLANS.essentiel });
  });

  it('renders always-on modules as navigable links', async () => {
    renderSidebar();
    expect(await screen.findByRole('link', { name: 'Élèves' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Parents' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Facturation' })).toBeInTheDocument();
  });

  it('shows gated modules as locked (non-link) affordances when the plan lacks them', async () => {
    act(() => {
      usePlanStore.setState({
        planId: 'essentiel',
        plan: planWithout('payroll.teacher', 'sync.multi-device'),
      });
    });
    renderSidebar();
    expect(screen.queryByRole('link', { name: /Paie/ })).not.toBeInTheDocument();
    const payroll = await screen.findByRole('button', { name: /Paie/ });
    expect(payroll).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: /Synchronisation/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('unlocks gated modules when the active plan includes the feature', async () => {
    renderSidebar();
    act(() => {
      usePlanStore.getState().setPlan('premium');
    });
    expect(await screen.findByRole('link', { name: 'Parents' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Synchronisation' })).toBeInTheDocument();
    // 'Paie' is additionally gated behind the async `auth.session` read
    // (assistant-visibility), so it needs its own wait — unlike the two links
    // above, which are plan-gated only and settle synchronously with the store.
    expect(await screen.findByRole('link', { name: 'Paie' })).toBeInTheDocument();
  });

  it('hides the per-center stats entry entirely when the plan lacks org.multi-center (SOU-309)', async () => {
    // `PLANS.essentiel` (the beforeEach default) grants every module flag except
    // `org.multi-center`, so the stats entry must be removed — not rendered as a
    // locked button or a link.
    renderSidebar();
    expect(await screen.findByRole('link', { name: 'Élèves' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Statistiques par centre' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Statistiques par centre/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Statistiques par centre')).not.toBeInTheDocument();
  });

  it('shows the per-center stats entry as a link for Premium (SOU-309)', async () => {
    renderSidebar();
    act(() => {
      usePlanStore.getState().setPlan('premium');
    });
    expect(await screen.findByRole('link', { name: 'Statistiques par centre' })).toBeInTheDocument();
  });
});
