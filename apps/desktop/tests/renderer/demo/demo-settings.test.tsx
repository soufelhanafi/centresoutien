import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DemoSettings } from '../../../src/renderer/components/settings/demo-settings';
import { demoGateway } from '../../../src/renderer/lib/demo/demo-gateway';
import type {
  DemoMutationResponse,
  DemoStatusResponse,
} from '../../../src/renderer/lib/demo/demo-contract';
import i18n from '../../../src/renderer/i18n/config';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DemoSettings />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DemoSettings (SOU-110 / SOU-186)', () => {
  it('shows the create action when the open center is not the demo', async () => {
    vi.spyOn(demoGateway, 'status').mockResolvedValue({ isDemo: false });
    renderSettings();

    expect(
      await screen.findByRole('button', { name: 'Créer le centre de démonstration' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer la démo' })).not.toBeInTheDocument();
  });

  it('shows the wipe action when the open center is the demo', async () => {
    vi.spyOn(demoGateway, 'status').mockResolvedValue({ isDemo: true });
    renderSettings();

    expect(await screen.findByRole('button', { name: 'Supprimer la démo' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Créer le centre de démonstration' }),
    ).not.toBeInTheDocument();
  });

  it('creates the demo and swaps into it in place — no restart screen', async () => {
    const create = vi.spyOn(demoGateway, 'create').mockResolvedValue({ isDemo: true });
    vi.spyOn(demoGateway, 'status')
      .mockResolvedValueOnce({ isDemo: false })
      .mockResolvedValue({ isDemo: true });
    const user = userEvent.setup();
    renderSettings();

    await user.click(
      await screen.findByRole('button', { name: 'Créer le centre de démonstration' }),
    );

    expect(create).toHaveBeenCalledTimes(1);
    // The DB hot-swapped in place: the tab flips to the demo (wipe) variant with
    // no restart state ever shown.
    expect(await screen.findByRole('button', { name: 'Supprimer la démo' })).toBeInTheDocument();
    expect(screen.queryByText("Redémarrage de l'application…")).not.toBeInTheDocument();
  });

  it('shows the pending state on the create button while the swap is in flight', async () => {
    vi.spyOn(demoGateway, 'status')
      .mockResolvedValueOnce({ isDemo: false })
      .mockResolvedValue({ isDemo: true });
    let releaseCreate!: () => void;
    vi.spyOn(demoGateway, 'create').mockImplementation(
      () =>
        new Promise<DemoMutationResponse>((resolve) => {
          releaseCreate = () => resolve({ isDemo: true });
        }),
    );
    const user = userEvent.setup();
    renderSettings();

    await user.click(
      await screen.findByRole('button', { name: 'Créer le centre de démonstration' }),
    );

    expect(screen.getByRole('button', { name: 'Création…' })).toBeDisabled();

    releaseCreate();
    expect(await screen.findByRole('button', { name: 'Supprimer la démo' })).toBeInTheDocument();
  });

  it('surfaces a create failure without leaving the form', async () => {
    vi.spyOn(demoGateway, 'status').mockResolvedValue({ isDemo: false });
    vi.spyOn(demoGateway, 'create').mockRejectedValue(new Error('seed failed'));
    const user = userEvent.setup();
    renderSettings();

    await user.click(
      await screen.findByRole('button', { name: 'Créer le centre de démonstration' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La création du centre de démonstration a échoué. Réessayez.',
    );
  });

  it('wipes only after confirmation, then swaps back to the real center in place', async () => {
    const wipe = vi.spyOn(demoGateway, 'wipe').mockResolvedValue({ isDemo: false });
    vi.spyOn(demoGateway, 'status')
      .mockResolvedValueOnce({ isDemo: true })
      .mockResolvedValue({ isDemo: false });
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole('button', { name: 'Supprimer la démo' }));
    expect(wipe).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/Toutes les données de démonstration seront définitivement supprimées/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer la démo' }));

    expect(wipe).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('button', { name: 'Créer le centre de démonstration' }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Redémarrage de l'application…")).not.toBeInTheDocument();
  });

  it('keeps the demo when the wipe dialog is cancelled', async () => {
    const wipe = vi.spyOn(demoGateway, 'wipe').mockResolvedValue({ isDemo: false });
    vi.spyOn(demoGateway, 'status').mockResolvedValue({ isDemo: true });
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole('button', { name: 'Supprimer la démo' }));
    // The dialog's close "X" and the footer "Annuler" share the accessible name;
    // the footer cancel is the first in DOM order (children render before the close).
    const cancelButtons = within(await screen.findByRole('dialog')).getAllByRole('button', {
      name: 'Annuler',
    });
    expect(cancelButtons.length).toBeGreaterThan(0);
    await user.click(cancelButtons[0]!);

    expect(wipe).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Supprimer la démo' })).toBeInTheDocument();
  });

  it('warns before creating when the laptop is the hub host; cancel does not create', async () => {
    const create = vi.spyOn(demoGateway, 'create');
    vi.spyOn(demoGateway, 'status').mockResolvedValue({ isDemo: false, isHubHost: true });
    const user = userEvent.setup();
    renderSettings();

    await user.click(
      await screen.findByRole('button', { name: 'Créer le centre de démonstration' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/Cet ordinateur est le serveur de synchronisation/),
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    // The dialog's close "X" and the footer "Annuler" share the accessible name;
    // the footer cancel is the first in DOM order (same pattern as the wipe dialog).
    const cancelButtons = within(dialog).getAllByRole('button', { name: 'Annuler' });
    expect(cancelButtons.length).toBeGreaterThan(0);
    await user.click(cancelButtons[0]!);

    expect(create).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirms the hub-host warning and proceeds with demo.create', async () => {
    const create = vi.spyOn(demoGateway, 'create').mockResolvedValue({ isDemo: true });
    vi.spyOn(demoGateway, 'status')
      .mockResolvedValueOnce({ isDemo: false, isHubHost: true })
      .mockResolvedValue({ isDemo: true, isHubHost: false });
    const user = userEvent.setup();
    renderSettings();

    await user.click(
      await screen.findByRole('button', { name: 'Créer le centre de démonstration' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Continuer quand même' }));

    expect(create).toHaveBeenCalledTimes(1);
    // The DB hot-swapped in place: the tab flips to the demo (wipe) variant.
    expect(await screen.findByRole('button', { name: 'Supprimer la démo' })).toBeInTheDocument();
  });

  it('shows the loading state while the demo status is unresolved', async () => {
    const pending = deferred<DemoStatusResponse>();
    vi.spyOn(demoGateway, 'status').mockReturnValue(pending.promise);
    renderSettings();

    expect(await screen.findByText('Vérification du mode démo…')).toBeInTheDocument();

    pending.resolve({ isDemo: false });
    expect(
      await screen.findByRole('button', { name: 'Créer le centre de démonstration' }),
    ).toBeInTheDocument();
  });

  it('shows an error with a working retry when the status read fails', async () => {
    vi.spyOn(demoGateway, 'status')
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValue({ isDemo: false });
    const user = userEvent.setup();
    renderSettings();

    expect(
      await screen.findByText(
        "Une erreur est survenue lors de la lecture de l'état de la démo. Réessayez.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(
      await screen.findByRole('button', { name: 'Créer le centre de démonstration' }),
    ).toBeInTheDocument();
  });
});
