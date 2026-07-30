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
import { PLANS } from '@centresoutien/domain';
import { Sidebar } from '../../src/renderer/components/shell/sidebar';
import { NAV_MODULES } from '../../src/renderer/app/nav-items';
import { usePlanStore } from '../../src/renderer/stores/plan-store';
import i18n from '../../src/renderer/i18n/config';

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
  return render(<RouterProvider router={router} />);
}

describe('Sidebar — plan-gated navigation', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    usePlanStore.setState({ planId: 'essentiel', plan: PLANS.essentiel });
  });

  it('renders always-on modules as navigable links', async () => {
    renderSidebar();
    expect(await screen.findByRole('link', { name: 'Élèves' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Facturation' })).toBeInTheDocument();
  });

  it('shows gated modules as locked (non-link) affordances on Essentiel', async () => {
    renderSidebar();
    expect(screen.queryByRole('link', { name: /Parents/ })).not.toBeInTheDocument();
    const parents = await screen.findByRole('button', { name: /Parents/ });
    expect(parents).toHaveAttribute('aria-disabled', 'true');
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
    expect(screen.getByRole('link', { name: 'Paie' })).toBeInTheDocument();
  });
});
