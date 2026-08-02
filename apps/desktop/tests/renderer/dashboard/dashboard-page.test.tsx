import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { PLANS } from '@centresoutien/domain';
import { DashboardPage } from '../../../src/renderer/pages/dashboard/dashboard-page';
import { useDashboardViewStore } from '../../../src/renderer/stores/dashboard-view-store';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import i18n from '../../../src/renderer/i18n/config';

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  localStorage.clear();
  act(() => {
    useDashboardViewStore.setState({ view: 'basic' });
    usePlanStore.setState({ planId: 'essentiel', plan: PLANS.essentiel });
  });
});

describe('DashboardPage — Basique / Avancé toggle', () => {
  it('defaults to the Basique tab', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('tab', { name: 'Basique' })).toHaveAttribute('aria-selected', 'true');
  });

  it('switches instantly and persists the choice to localStorage', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    await user.click(screen.getByRole('tab', { name: 'Avancé' }));

    expect(screen.getByRole('tab', { name: 'Avancé' })).toHaveAttribute('aria-selected', 'true');
    expect(useDashboardViewStore.getState().view).toBe('advanced');
    const stored = localStorage.getItem('centre-soutien.dashboard-view');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? '{}').state.view).toBe('advanced');
  });

  it('locks the Avancé pane on a plan without dashboard.advanced', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    await user.click(screen.getByRole('tab', { name: 'Avancé' }));

    expect(screen.getByText('Réservé à un plan supérieur')).toBeInTheDocument();
  });

  it('unlocks the Avancé pane on a plan with dashboard.advanced', async () => {
    act(() => {
      usePlanStore.setState({ planId: 'premium', plan: PLANS.premium });
    });
    const user = userEvent.setup();
    render(<DashboardPage />);

    await user.click(screen.getByRole('tab', { name: 'Avancé' }));

    expect(screen.queryByText('Réservé à un plan supérieur')).not.toBeInTheDocument();
  });
});
