import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginScreen } from '../../../src/renderer/components/auth/login-screen';
import { demoGateway } from '../../../src/renderer/lib/demo/demo-gateway';
import type { DemoMutationResponse } from '../../../src/renderer/lib/demo/demo-contract';
import i18n from '../../../src/renderer/i18n/config';

function renderLogin(onAuthenticated = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <LoginScreen onAuthenticated={onAuthenticated} />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LoginScreen — demo entry (SOU-110 / SOU-186)', () => {
  it('shows the "Explorer la démo" entry under the login form', async () => {
    renderLogin();

    const button = await screen.findByRole('button', { name: 'Explorer la démo' });
    expect(button).toBeEnabled();
    expect(
      screen.getByText(
        "Essayez l'application avec un centre de démonstration pré-rempli. Aucune donnée réelle ne sera modifiée.",
      ),
    ).toBeInTheDocument();
  });

  it('creates the demo on click and hot-swaps in place — no restart screen', async () => {
    const create = vi.spyOn(demoGateway, 'create').mockResolvedValue({ isDemo: true });
    const user = userEvent.setup();
    renderLogin();

    await user.click(await screen.findByRole('button', { name: 'Explorer la démo' }));

    expect(create).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Redémarrage de l'application…")).not.toBeInTheDocument();
    // The entry stays disabled through the swap; the gates above re-evaluate the
    // demo DB and drop the user in — this isolated screen never restarts.
    expect(await screen.findByRole('button', { name: 'Création…' })).toBeDisabled();
  });

  it('prefills the demo credentials and hides the create entry when the open center IS the demo', async () => {
    vi.spyOn(demoGateway, 'status').mockResolvedValue({
      isDemo: true,
      demoLogin: { username: 'demo', password: ['Demo', 'unit', '1'].join('') },
    });
    renderLogin();

    await waitFor(() =>
      expect(screen.getByLabelText("Nom d'utilisateur")).toHaveValue('demo'),
    );
    expect(screen.getByText('Connexion démo')).toBeInTheDocument();
    expect(screen.getByText(/Utilisateur\s*:\s*demo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Explorer la démo' })).not.toBeInTheDocument();
  });

  it('does NOT prefill or hint on a real (non-demo) center', async () => {
    vi.spyOn(demoGateway, 'status').mockResolvedValue({ isDemo: false, demoLogin: null });
    renderLogin();

    const username = await screen.findByLabelText("Nom d'utilisateur");
    expect(username).toHaveValue('');
    expect(screen.queryByText('Connexion démo')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Explorer la démo' })).toBeInTheDocument();
  });

  it('warns before creating when the laptop is the hub host; cancel does not create', async () => {
    const create = vi.spyOn(demoGateway, 'create');
    vi.spyOn(demoGateway, 'status').mockResolvedValue({
      isDemo: false,
      demoLogin: null,
      isHubHost: true,
    });
    const user = userEvent.setup();
    renderLogin();

    await user.click(await screen.findByRole('button', { name: 'Explorer la démo' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/Cet ordinateur est le serveur de synchronisation/),
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    await user.click(within(dialog).getAllByRole('button', { name: 'Annuler' })[0]!);

    expect(create).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirms the hub-host warning and proceeds with demo.create', async () => {
    const create = vi.spyOn(demoGateway, 'create').mockResolvedValue({ isDemo: true });
    vi.spyOn(demoGateway, 'status').mockResolvedValue({
      isDemo: false,
      demoLogin: null,
      isHubHost: true,
    });
    const user = userEvent.setup();
    renderLogin();

    await user.click(await screen.findByRole('button', { name: 'Explorer la démo' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Continuer quand même' }));

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('disables the entry while the swap is in flight', async () => {
    const create = vi.spyOn(demoGateway, 'create');
    let releaseCreate!: () => void;
    create.mockImplementation(
      () =>
        new Promise<DemoMutationResponse>((resolve) => {
          releaseCreate = () => resolve({ isDemo: true });
        }),
    );
    const user = userEvent.setup();
    renderLogin();

    await user.click(await screen.findByRole('button', { name: 'Explorer la démo' }));

    expect(screen.getByRole('button', { name: 'Création…' })).toBeDisabled();

    releaseCreate();
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Création…' })).toBeDisabled();
  });
});
