import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginScreen } from '../../../src/renderer/components/auth/login-screen';
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
  return { onAuthenticated };
}

async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nom d'utilisateur"), 'directeur');
  await user.type(screen.getByLabelText('Mot de passe'), 'Motdepasse1');
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LoginScreen (SOU-27)', () => {
  it('submits credentials and hands control to the gate on success', async () => {
    const invoke = vi.fn().mockResolvedValue({ outcome: 'success' });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    const { onAuthenticated } = renderLogin();

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('auth.login', {
        username: 'directeur',
        password: 'Motdepasse1',
        rememberDevice: false,
      }),
    );
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it('passes rememberDevice=true when the toggle is checked', async () => {
    const invoke = vi.fn().mockResolvedValue({ outcome: 'success' });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderLogin();

    await fillCredentials(user);
    await user.click(screen.getByLabelText('Se souvenir de cet appareil'));
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'auth.login',
        expect.objectContaining({ rememberDevice: true }),
      ),
    );
  });

  it('shows remaining attempts and does not authenticate on invalid credentials', async () => {
    window.api.invoke = vi
      .fn()
      .mockResolvedValue({ outcome: 'invalid-credentials', remainingAttempts: 3 });
    const user = userEvent.setup();
    const { onAuthenticated } = renderLogin();

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByText(/Il vous reste 3/)).toBeInTheDocument();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('locks the form with a countdown when the account is locked out', async () => {
    window.api.invoke = vi
      .fn()
      .mockResolvedValue({ outcome: 'locked-out', lockedUntilMs: Date.now() + 15 * 60 * 1000 });
    const user = userEvent.setup();
    renderLogin();

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByText('Compte temporairement verrouillé')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeDisabled();
  });

  it('validates that username and password are required', async () => {
    const invoke = vi.fn();
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByText("Le nom d'utilisateur est requis")).toBeInTheDocument();
    expect(screen.getByText('Le mot de passe est requis')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });
});
