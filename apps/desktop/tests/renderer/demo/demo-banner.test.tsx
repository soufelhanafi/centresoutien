import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DemoBanner } from '../../../src/renderer/components/shell/demo-banner';
import { demoGateway } from '../../../src/renderer/lib/demo/demo-gateway';
import i18n from '../../../src/renderer/i18n/config';

function renderBanner() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DemoBanner />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DemoBanner (SOU-110)', () => {
  it('renders nothing when the open center is not the demo', async () => {
    const status = vi.spyOn(demoGateway, 'status').mockResolvedValue({ isDemo: false });
    renderBanner();

    await waitFor(() => expect(status).toHaveBeenCalled());
    expect(screen.queryByText('MODE DÉMO')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it('renders the demo strip and its wipe action when in the demo', async () => {
    vi.spyOn(demoGateway, 'status').mockResolvedValue({ isDemo: true });
    renderBanner();

    expect(await screen.findByText('MODE DÉMO')).toBeInTheDocument();
    expect(screen.getByText('centre de démonstration')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument();
  });

  it('wipes only after confirmation, then swaps to the restarting state', async () => {
    const wipe = vi.spyOn(demoGateway, 'wipe').mockResolvedValue({ relaunching: true });
    vi.spyOn(demoGateway, 'status').mockResolvedValue({ isDemo: true });
    const user = userEvent.setup();
    renderBanner();

    await user.click(await screen.findByRole('button', { name: 'Supprimer' }));
    expect(wipe).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer la démo' }));

    expect(wipe).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Redémarrage de l'application…")).toBeInTheDocument();
  });

  it('keeps the banner intact when the wipe dialog is cancelled', async () => {
    const wipe = vi.spyOn(demoGateway, 'wipe').mockResolvedValue({ relaunching: true });
    vi.spyOn(demoGateway, 'status').mockResolvedValue({ isDemo: true });
    const user = userEvent.setup();
    renderBanner();

    await user.click(await screen.findByRole('button', { name: 'Supprimer' }));
    // The dialog's close "X" and the footer "Annuler" share the accessible name;
    // the footer cancel is the first in DOM order (children render before the close).
    const cancelButtons = within(await screen.findByRole('dialog')).getAllByRole('button', {
      name: 'Annuler',
    });
    expect(cancelButtons.length).toBeGreaterThan(0);
    await user.click(cancelButtons[0]!);

    expect(wipe).not.toHaveBeenCalled();
    expect(screen.getByText('MODE DÉMO')).toBeInTheDocument();
  });
});
