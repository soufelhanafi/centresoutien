import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PLANS } from '@centresoutien/domain';
import { HubHostingCard } from '../../../src/renderer/components/settings/hub/hub-hosting-card';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import { planWithout } from '../fakes/plan';
import i18n from '../../../src/renderer/i18n/config';

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HubHostingCard />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  usePlanStore.setState({ planId: 'premium', plan: PLANS.premium });
  await i18n.changeLanguage('fr');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HubHostingCard — plan gating (SOU-318)', () => {
  it('renders nothing and never reads status without sync.multi-device', () => {
    usePlanStore.setState({ planId: 'essentiel', plan: planWithout('sync.multi-device') });
    const invoke = vi.fn(async () => ({ hosting: false }));
    window.api.invoke = invoke;

    const { container } = renderCard();

    expect(container).toBeEmptyDOMElement();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('HubHostingCard — not hosting (SOU-318)', () => {
  it('enables hosting through the confirm dialog', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'hub.hostingStatus') return { hosting: false };
      if (channel === 'hub.enableHosting') {
        return { hosting: true, address: '192.168.1.10', port: 8787, token: 'A1B2-C3D4-E5F6' };
      }
      return {};
    });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Héberger ce centre' }));
    // Restart notice appears in the confirm dialog before the call runs.
    expect(await screen.findByText("L'application va redémarrer pour appliquer ce changement.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Héberger et redémarrer' }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('hub.enableHosting', {}));
  });
});

describe('HubHostingCard — hosting (SOU-318)', () => {
  it('shows the pairing token + address and stops hosting through the confirm dialog', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'hub.hostingStatus') {
        return { hosting: true, address: '192.168.1.10', port: 8787, token: 'A1B2-C3D4-E5F6' };
      }
      if (channel === 'hub.disableHosting') return { ok: true };
      return {};
    });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderCard();

    expect(await screen.findByText('A1B2-C3D4-E5F6')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.10:8787')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: "Arrêter l'hébergement" }));
    await user.click(await screen.findByRole('button', { name: 'Arrêter et redémarrer' }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('hub.disableHosting', {}));
  });
});
