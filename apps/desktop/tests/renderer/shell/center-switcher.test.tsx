import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useNavigate: () => vi.fn(),
}));

import { CenterSwitcher } from '../../../src/renderer/components/shell/center-switcher';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import i18n from '../../../src/renderer/i18n/config';

/**
 * SOU-96 — the header switcher is Premium (`org.multi-center`) AND only appears
 * when the device holds more than one center. Everyone else keeps today's plain
 * center-name label. Both locales are covered so the RTL trigger label ships.
 */
function renderSwitcher() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CenterSwitcher />
    </QueryClientProvider>,
  );
}

describe('CenterSwitcher — gating', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    window.api.invoke = vi.fn(async (channel: string) =>
      channel === 'center.get' ? { center: null } : { planId: 'essentiel' },
    );
  });

  afterEach(() => {
    usePlanStore.getState().setPlan('essentiel');
    vi.restoreAllMocks();
  });

  it('shows the plain center-name label for a non-Premium install', async () => {
    usePlanStore.getState().setPlan('essentiel');
    renderSwitcher();

    expect(await screen.findByText('Centre principal')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Changer de centre/)).not.toBeInTheDocument();
  });

  it('shows the switcher dropdown for a Premium install with several centers', async () => {
    usePlanStore.getState().setPlan('premium');
    renderSwitcher();

    expect(await screen.findByLabelText(/Changer de centre/)).toBeInTheDocument();
  });

  it('renders the switcher trigger under the Arabic (RTL) locale', async () => {
    await i18n.changeLanguage('ar');
    usePlanStore.getState().setPlan('premium');
    renderSwitcher();

    expect(await screen.findByLabelText(/تغيير المركز/)).toBeInTheDocument();
  });
});
