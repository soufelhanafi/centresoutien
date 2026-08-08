import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LicenseActivationScreen } from '../../../src/renderer/components/license/license-activation-screen';
import { demoGateway } from '../../../src/renderer/lib/demo/demo-gateway';
import type { LicenseStatusView } from '../../../src/renderer/lib/license/license-contract';
import i18n from '../../../src/renderer/i18n/config';

const RESTRICTED_STATUS: LicenseStatusView = {
  status: 'missing',
  plan: 'essentiel',
  restricted: true,
  expiresAt: null,
  centersAllowed: null,
  founderDiscountExpiresAt: null,
  founderDiscountExpired: false,
};

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <LicenseActivationScreen status={RESTRICTED_STATUS} />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LicenseActivationScreen — demo entry (SOU-110, review M2)', () => {
  it('shows the "Explorer la démo" entry on an unlicensed (restricted) screen', async () => {
    renderScreen();

    const button = await screen.findByRole('button', { name: 'Explorer la démo' });
    expect(button).toBeEnabled();
  });

  it('creates the demo on click and swaps to the restarting state', async () => {
    const create = vi.spyOn(demoGateway, 'create').mockResolvedValue({ relaunching: true });
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Explorer la démo' }));

    expect(create).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Redémarrage de l'application…")).toBeInTheDocument();
  });

  it('surfaces a create failure as an alert', async () => {
    vi.spyOn(demoGateway, 'create').mockRejectedValue(new Error('seed failed'));
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Explorer la démo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La création du centre de démonstration a échoué. Réessayez.',
    );
  });
});
