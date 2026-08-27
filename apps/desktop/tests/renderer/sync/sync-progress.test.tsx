import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PLANS } from '@centresoutien/domain';
import type { SyncProgressEvent } from '../../../src/shared/ipc/sync-events';
import { SyncPage } from '../../../src/renderer/pages/sync/sync-page';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import i18n from '../../../src/renderer/i18n/config';

type ProgressListener = (event: SyncProgressEvent) => void;

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

function captureProgressListener(): { current: ProgressListener | null } {
  const ref: { current: ProgressListener | null } = { current: null };
  window.api.onSyncProgress = (listener: ProgressListener) => {
    ref.current = listener;
    return () => {
      ref.current = null;
    };
  };
  return ref;
}

const pausedResult = {
  status: 'paused' as const,
  applied: 0,
  pushed: 0,
  conflicts: [],
  reversalDedups: [],
  userCredentialDuplicates: [],
  deviceClockSkew: false,
  resolutionPermission: 'granted' as const,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Sync page — chunked progress (SOU-330)', () => {
  it('renders the live count and a remaining-time line, and Stop cancels the run', async () => {
    await i18n.changeLanguage('fr');
    usePlanStore.setState({ planId: 'premium', plan: PLANS.premium });

    const listener = captureProgressListener();
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const invoke = vi.fn((channel: string) => {
      if (channel === 'sync.conflicts.list') return Promise.resolve({ conflicts: [] });
      if (channel === 'sync.cancel') return Promise.resolve({ ok: true });
      // A run that never settles keeps the mutation pending so the bar stays mounted.
      if (channel === 'sync.run') return new Promise(() => {});
      return Promise.resolve({});
    });
    window.api.invoke = invoke as typeof window.api.invoke;

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Synchroniser' }));

    act(() => {
      listener.current?.({ pulled: 1200, total: 5000 });
    });
    now = 3000;
    act(() => {
      listener.current?.({ pulled: 2400, total: 5000 });
    });

    const bar = await screen.findByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '2400');
    expect(bar).toHaveAttribute('aria-valuemax', '5000');
    expect(screen.getByText(/restant/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Arrêter' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('sync.cancel', {});
    });
  });

  it('shows a Resume affordance when the last run ended paused', async () => {
    await i18n.changeLanguage('fr');
    usePlanStore.setState({ planId: 'premium', plan: PLANS.premium });
    captureProgressListener();

    window.api.invoke = vi.fn((channel: string) => {
      if (channel === 'sync.conflicts.list') return Promise.resolve({ conflicts: [] });
      if (channel === 'sync.run') return Promise.resolve({ result: pausedResult });
      return Promise.resolve({});
    }) as typeof window.api.invoke;

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Synchroniser' }));

    expect(await screen.findByRole('button', { name: 'Reprendre' })).toBeInTheDocument();
  });
});
