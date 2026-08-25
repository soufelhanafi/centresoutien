import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForgotPasswordFlow } from '../../../src/renderer/components/auth/forgot-password/forgot-password-flow';
import i18n from '../../../src/renderer/i18n/config';

function renderFlow(onClose = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ForgotPasswordFlow onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

async function pickRecovery(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Code de récupération/ }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ForgotPasswordFlow — French', () => {
  it('opens on a method chooser offering the recovery and email paths', () => {
    renderFlow();

    expect(
      screen.getByText('Comment souhaitez-vous réinitialiser votre mot de passe ?'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Code de récupération/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Par e-mail/ })).toBeInTheDocument();
  });

  it('resets via a recovery code and lands on the fresh-login notice', async () => {
    const invoke = vi.fn(async () => ({ outcome: 'success' }));
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderFlow();
    await pickRecovery(user);

    await user.type(screen.getByLabelText('Code de récupération'), 'ABCD-EFGH-IJKL-MNOP');
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'Password1');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'Password1');
    await user.click(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('auth.resetWithCode', {
        code: 'ABCD-EFGH-IJKL-MNOP',
        password: 'Password1',
      }),
    );
    expect(await screen.findByText('Connectez-vous avec votre nouveau mot de passe.')).toBeInTheDocument();
  });

  it('shows the lockout notice and disables the form when the reset is throttled', async () => {
    const invoke = vi.fn(async () => ({ outcome: 'locked-out', lockedUntilMs: Date.now() + 60_000 }));
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderFlow();
    await pickRecovery(user);

    await user.type(screen.getByLabelText('Code de récupération'), 'ABCD-EFGH-IJKL-MNOP');
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'Password1');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'Password1');
    await user.click(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' }));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' })).toBeDisabled();
    expect(screen.getByLabelText('Code de récupération')).toBeDisabled();
  });

  it('returns to the chooser from a method via the back button', async () => {
    const user = userEvent.setup();
    renderFlow();
    await pickRecovery(user);

    expect(screen.getByLabelText('Code de récupération')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retour' }));

    expect(
      screen.getByText('Comment souhaitez-vous réinitialiser votre mot de passe ?'),
    ).toBeInTheDocument();
  });

  it('closes the flow from the chooser via the back button', async () => {
    const user = userEvent.setup();
    const { onClose } = renderFlow();

    await user.click(screen.getByRole('button', { name: 'Retour' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ForgotPasswordFlow — email path', () => {
  it('sends a locale-aware code, then confirms with a new password and lands on the notice', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'auth.emailReset.request') return { outcome: 'sent' };
      return { outcome: 'success' };
    });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole('button', { name: /Par e-mail/ }));
    await user.type(screen.getByLabelText("Nom d'utilisateur"), 'sanaa');
    await user.click(screen.getByRole('button', { name: 'Envoyer le code' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('auth.emailReset.request', {
        username: 'sanaa',
        locale: 'fr',
      }),
    );

    await user.type(screen.getByLabelText('Code à 6 chiffres'), '123456');
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'Password1');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'Password1');
    await user.click(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('auth.emailReset.confirm', {
        username: 'sanaa',
        code: '123456',
        password: 'Password1',
      }),
    );
    expect(
      await screen.findByText('Votre mot de passe a été réinitialisé. Connectez-vous avec votre nouveau mot de passe.'),
    ).toBeInTheDocument();
  });

  it('points back to the recovery path when no email is on file', async () => {
    window.api.invoke = vi.fn(async () => ({ outcome: 'no-email' }));
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole('button', { name: /Par e-mail/ }));
    await user.type(screen.getByLabelText("Nom d'utilisateur"), 'sanaa');
    await user.click(screen.getByRole('button', { name: 'Envoyer le code' }));

    expect(
      await screen.findByText(/Aucune adresse e-mail n'est enregistrée/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Utiliser un code de récupération' }));
    expect(
      screen.getByText('Comment souhaitez-vous réinitialiser votre mot de passe ?'),
    ).toBeInTheDocument();
  });

  it('shows a distinct message when the username matches no account', async () => {
    window.api.invoke = vi.fn(async () => ({ outcome: 'account-not-found' }));
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole('button', { name: /Par e-mail/ }));
    await user.type(screen.getByLabelText("Nom d'utilisateur"), 'ghost');
    await user.click(screen.getByRole('button', { name: 'Envoyer le code' }));

    expect(await screen.findByText(/Aucun compte ne correspond/)).toBeInTheDocument();
    // Not the no-email message, and no recovery-code suggestion for a wrong username.
    expect(screen.queryByRole('button', { name: 'Utiliser un code de récupération' })).not.toBeInTheDocument();
  });

  it('marks the code field when the relay rejects the code', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'auth.emailReset.request') return { outcome: 'sent' };
      return { outcome: 'invalid-or-expired' };
    });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole('button', { name: /Par e-mail/ }));
    await user.type(screen.getByLabelText("Nom d'utilisateur"), 'sanaa');
    await user.click(screen.getByRole('button', { name: 'Envoyer le code' }));
    await user.type(await screen.findByLabelText('Code à 6 chiffres'), '000000');
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'Password1');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'Password1');
    await user.click(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' }));

    expect(await screen.findByText('Code invalide ou expiré.')).toBeInTheDocument();
  });
});

describe('ForgotPasswordFlow — Arabic (RTL)', () => {
  it('renders Arabic copy', async () => {
    await i18n.changeLanguage('ar');
    renderFlow();

    expect(screen.getByRole('heading', { name: 'إعادة تعيين كلمة المرور' })).toBeInTheDocument();
    expect(screen.getByText('كيف تريد إعادة تعيين كلمة المرور؟')).toBeInTheDocument();

    await i18n.changeLanguage('fr');
  });
});
