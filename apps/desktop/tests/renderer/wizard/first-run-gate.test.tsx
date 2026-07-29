import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FirstRunGate } from '../../../src/renderer/components/wizard/first-run-gate';
import { useWizardStore } from '../../../src/renderer/stores/wizard-store';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import i18n from '../../../src/renderer/i18n/config';

function renderGate() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FirstRunGate>
        <div>app-content</div>
      </FirstRunGate>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  useWizardStore.setState({ state: null });
  usePlanStore.getState().setPlan('essentiel');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FirstRunGate', () => {
  it('renders the app when an admin account already exists', async () => {
    window.api.invoke = vi.fn().mockResolvedValue({ exists: true });
    renderGate();
    expect(await screen.findByText('app-content')).toBeInTheDocument();
    expect(screen.queryByText('Choisissez la langue')).toBeNull();
  });

  it('renders the wizard on a fresh install (no admin account)', async () => {
    window.api.invoke = vi.fn().mockResolvedValue({ exists: false });
    renderGate();
    expect(await screen.findByText('Choisissez la langue')).toBeInTheDocument();
    expect(screen.queryByText('app-content')).toBeNull();
  });

  it('shows a retry affordance when first-run detection fails', async () => {
    window.api.invoke = vi.fn().mockRejectedValue(new Error('ipc down'));
    renderGate();
    expect(await screen.findByText('Impossible de démarrer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
