import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PLANS } from '@centresoutien/domain';
import { SyncPage } from '../../../src/renderer/pages/sync/sync-page';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import i18n from '../../../src/renderer/i18n/config';
import { planWithout } from '../fakes/plan';

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SyncPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Sync page — plan gating', () => {
  it('shows the full-page lock and never queries conflicts without sync.multi-device', async () => {
    await i18n.changeLanguage('fr');
    usePlanStore.setState({ planId: 'essentiel', plan: planWithout('sync.multi-device') });
    const invoke = vi.fn(async () => ({ conflicts: [] }));
    window.api.invoke = invoke;

    renderPage();

    expect(screen.getByText('Réservé à un plan supérieur')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Synchroniser' })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('renders the sync controls when the plan includes sync.multi-device', async () => {
    await i18n.changeLanguage('fr');
    usePlanStore.setState({ planId: 'premium', plan: PLANS.premium });
    window.api.invoke = vi.fn(async () => ({ conflicts: [] }));

    renderPage();

    expect(screen.getByRole('button', { name: 'Synchroniser' })).toBeInTheDocument();
    expect(screen.queryByText('Réservé à un plan supérieur')).not.toBeInTheDocument();
  });

  it('shows the Arabic lock message on a plan without sync.multi-device', async () => {
    await i18n.changeLanguage('ar');
    usePlanStore.setState({ planId: 'essentiel', plan: planWithout('sync.multi-device') });
    window.api.invoke = vi.fn(async () => ({ conflicts: [] }));

    renderPage();

    expect(screen.getByText('غير متاح في خطتك')).toBeInTheDocument();
    await i18n.changeLanguage('fr');
  });
});

describe('Sync page — owner credential duplicate nudge (SOU-258 follow-up)', () => {
  function resultWith(userCredentialDuplicates: unknown[]) {
    return {
      status: 'synced',
      applied: 1,
      pushed: 1,
      conflicts: [],
      reversalDedups: [],
      userCredentialDuplicates,
      deviceClockSkew: false,
      resolutionPermission: 'granted',
    };
  }

  it('renders the reset nudge after a sync that reports a same-username duplicate', async () => {
    await i18n.changeLanguage('fr');
    usePlanStore.setState({ planId: 'premium', plan: PLANS.premium });
    window.api.invoke = vi.fn(async (channel: string) =>
      channel === 'sync.run'
        ? {
            result: resultWith([
              {
                entityType: 'users',
                username: 'directrice',
                winnerId: 'usr_00000000000000000000000002',
                loserId: 'usr_00000000000000000000000001',
              },
            ]),
          }
        : { conflicts: [] },
    );

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Synchroniser' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Un compte du même identifiant');
    expect(alert).toHaveTextContent('réinitialisez le mot de passe');
  });

  it('shows no nudge when the sync reports no duplicates', async () => {
    await i18n.changeLanguage('fr');
    usePlanStore.setState({ planId: 'premium', plan: PLANS.premium });
    window.api.invoke = vi.fn(async (channel: string) =>
      channel === 'sync.run' ? { result: resultWith([]) } : { conflicts: [] },
    );

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Synchroniser' }));

    await waitFor(() =>
      expect(screen.getByText('Synchronisé : 1 appliquée(s), 1 envoyée(s), 0 conflit(s).')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
