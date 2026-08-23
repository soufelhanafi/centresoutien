import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PLANS } from '@centresoutien/domain';
import { MultiCenterStatsPage } from '../../../src/renderer/pages/multi-center-stats/multi-center-stats-page';
import { MultiCenterStatsContent } from '../../../src/renderer/components/multi-center-stats/multi-center-stats-content';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import { MOCK_MULTI_CENTER_STATS_VIEW } from '../../../src/renderer/lib/multi-center-stats/multi-center-stats-gateway.mock';
import i18n from '../../../src/renderer/i18n/config';

function renderWithQuery(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function dataRowNames(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((tr) => within(tr).queryByText(/Centre|Al Amal|Annajah|Al Fajr/)?.textContent ?? '')
    .filter((name) => name !== '');
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  act(() => {
    usePlanStore.setState({ planId: 'premium', plan: PLANS.premium });
  });
});

describe('MultiCenterStatsPage — plan gating', () => {
  it('locks the screen for a non-Premium plan with an upgrade CTA', () => {
    act(() => {
      usePlanStore.setState({ planId: 'essentiel', plan: PLANS.essentiel });
    });
    renderWithQuery(<MultiCenterStatsPage />);

    expect(screen.getByText('Statistiques multi-centres')).toBeInTheDocument();
    expect(screen.getByText('Réservé à un plan supérieur')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Débloquer avec Premium' })).toBeInTheDocument();
  });
});

describe('MultiCenterStatsContent — table', () => {
  const view = MOCK_MULTI_CENTER_STATS_VIEW;

  it('renders one row per center with the sync caveat', () => {
    renderWithQuery(<MultiCenterStatsContent view={view} locale="fr" />);

    expect(screen.getByText('Centre Al Amal — Casablanca')).toBeInTheDocument();
    expect(screen.getByText('Centre Annajah — Rabat')).toBeInTheDocument();
    expect(screen.getByText(/dernière réplique synchronisée/)).toBeInTheDocument();
  });

  it('shows a "data unavailable" cell for an unreadable center, not fake zeros', () => {
    renderWithQuery(<MultiCenterStatsContent view={view} locale="fr" />);

    const fesRow = screen.getByText('Centre Al Fajr — Fès').closest('tr');
    expect(fesRow).not.toBeNull();
    expect(within(fesRow as HTMLElement).getByText('Données indisponibles')).toBeInTheDocument();
  });

  it('sorts by a numeric column when its header is clicked', async () => {
    const user = userEvent.setup();
    renderWithQuery(<MultiCenterStatsContent view={view} locale="fr" />);

    // Default sort is revenue desc: Casa (4.82M) before Rabat (3.15M), Fès (unavailable) last.
    expect(dataRowNames()).toEqual([
      'Centre Al Amal — Casablanca',
      'Centre Annajah — Rabat',
      'Centre Al Fajr — Fès',
    ]);

    // Students desc keeps Casa (182) > Rabat (120); a second click flips to ascending.
    await user.click(screen.getByRole('button', { name: /Élèves/ }));
    await user.click(screen.getByRole('button', { name: /Élèves/ }));

    expect(dataRowNames()).toEqual([
      'Centre Annajah — Rabat',
      'Centre Al Amal — Casablanca',
      'Centre Al Fajr — Fès',
    ]);
  });

  it('filters rows by center name', async () => {
    const user = userEvent.setup();
    renderWithQuery(<MultiCenterStatsContent view={view} locale="fr" />);

    await user.type(screen.getByRole('searchbox'), 'Rabat');

    expect(screen.getByText('Centre Annajah — Rabat')).toBeInTheDocument();
    expect(screen.queryByText('Centre Al Amal — Casablanca')).not.toBeInTheDocument();
  });
});
