import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PLANS } from '@centresoutien/domain';
import { SyncStatusBanner } from '../../../src/renderer/components/shell/sync-status-banner';
import { useRunSync } from '../../../src/renderer/hooks/sync/use-sync';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import i18n from '../../../src/renderer/i18n/config';
import { planWithout } from '../fakes/plan';

/** Fires the same `sync.run` mutation `syncKeys.run` observes, exactly as the
 *  Sync page's button would — proving the banner reacts to ANY caller, not
 *  just one wired up specifically for this test. */
function RunTrigger() {
  const run = useRunSync();
  return (
    <button type="button" onClick={() => run.mutate()}>
      run
    </button>
  );
}

function renderHarness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SyncStatusBanner />
      <RunTrigger />
    </QueryClientProvider>,
  );
}

function pendingInvoke() {
  let resolve: (value: unknown) => void = () => undefined;
  const invoke = vi.fn(() => new Promise((res) => (resolve = res)));
  return { invoke, resolve: (value: unknown) => resolve(value) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SyncStatusBanner', () => {
  it('stays hidden on a plan without sync.multi-device, even while a sync runs', async () => {
    await i18n.changeLanguage('fr');
    usePlanStore.setState({ planId: 'essentiel', plan: planWithout('sync.multi-device') });
    const { invoke, resolve } = pendingInvoke();
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole('button', { name: 'run' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    resolve({ result: null });
  });

  it('appears while the sync is in flight and clears once it settles', async () => {
    await i18n.changeLanguage('fr');
    usePlanStore.setState({ planId: 'premium', plan: PLANS.premium });
    const { invoke, resolve } = pendingInvoke();
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderHarness();

    expect(screen.queryByText('Synchronisation en cours…')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'run' }));
    expect(await screen.findByText('Synchronisation en cours…')).toBeInTheDocument();

    resolve({
      result: {
        status: 'synced',
        applied: 0,
        pushed: 0,
        conflicts: [],
        reversalDedups: [],
        userCredentialDuplicates: [],
        deviceClockSkew: false,
        resolutionPermission: 'granted',
      },
    });
    await waitFor(() =>
      expect(screen.queryByText('Synchronisation en cours…')).not.toBeInTheDocument(),
    );
  });

  it('renders the Arabic copy', async () => {
    await i18n.changeLanguage('ar');
    usePlanStore.setState({ planId: 'premium', plan: PLANS.premium });
    const { invoke, resolve } = pendingInvoke();
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole('button', { name: 'run' }));
    expect(await screen.findByText('المزامنة جارية…')).toBeInTheDocument();
    resolve({ result: null });
    await i18n.changeLanguage('fr');
  });
});
