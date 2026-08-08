import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginScreen } from '../../../src/renderer/components/auth/login-screen';
import { demoGateway } from '../../../src/renderer/lib/demo/demo-gateway';
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

describe('LoginScreen — demo entry (SOU-110)', () => {
  it('shows the "Explorer la démo" entry under the login form', async () => {
    renderLogin();

    const button = await screen.findByRole('button', { name: 'Explorer la démo' });
    expect(button).toBeEnabled();
    expect(
      screen.getByText(
        "Essayez l'application avec un centre de démonstration pré-rempli. L'application redémarrera ; aucune donnée réelle ne sera modifiée.",
      ),
    ).toBeInTheDocument();
  });

  it('creates the demo on click and shows the restarting state', async () => {
    const create = vi.spyOn(demoGateway, 'create').mockResolvedValue({ relaunching: true });
    const user = userEvent.setup();
    renderLogin();

    await user.click(await screen.findByRole('button', { name: 'Explorer la démo' }));

    expect(create).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Redémarrage de l'application…")).toBeInTheDocument();
  });

  it('disables the entry while the create is pending', async () => {
    let releaseCreate!: () => void;
    vi.spyOn(demoGateway, 'create').mockImplementation(
      () =>
        new Promise<{ relaunching: true }>((resolve) => {
          releaseCreate = () => resolve({ relaunching: true });
        }),
    );
    const user = userEvent.setup();
    renderLogin();

    await user.click(await screen.findByRole('button', { name: 'Explorer la démo' }));

    const button = screen.getByRole('button', { name: 'Création…' });
    expect(button).toBeDisabled();

    releaseCreate();
    expect(await screen.findByText("Redémarrage de l'application…")).toBeInTheDocument();
  });
});
