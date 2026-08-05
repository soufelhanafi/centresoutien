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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ForgotPasswordFlow — French', () => {
  it('renders the recovery-code form directly, without a method chooser', () => {
    renderFlow();

    expect(screen.getByLabelText('Code de récupération')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' })).toBeInTheDocument();
    expect(screen.queryByText(/Questions de sécurité/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bientôt disponible/)).not.toBeInTheDocument();
  });

  it('resets via a recovery code and lands on the fresh-login notice', async () => {
    const invoke = vi.fn(async () => ({ outcome: 'success' }));
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderFlow();

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
    expect(await screen.findByText('Mot de passe réinitialisé')).toBeInTheDocument();
  });

  it('shows the lockout notice and disables the form when the reset is throttled', async () => {
    const invoke = vi.fn(async () => ({ outcome: 'locked-out', lockedUntilMs: Date.now() + 60_000 }));
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderFlow();

    await user.type(screen.getByLabelText('Code de récupération'), 'ABCD-EFGH-IJKL-MNOP');
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'Password1');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'Password1');
    await user.click(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' }));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' })).toBeDisabled();
    expect(screen.getByLabelText('Code de récupération')).toBeDisabled();
  });

  it('blocks submission when the two passwords do not match', async () => {
    const invoke = vi.fn(async () => ({ outcome: 'success' }));
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderFlow();

    await user.type(screen.getByLabelText('Code de récupération'), 'ABCD-EFGH-IJKL-MNOP');
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'Password1');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'Password2');
    await user.click(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Confirmer le mot de passe')).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it('returns to login from the recovery form via the back button', async () => {
    const user = userEvent.setup();
    const { onClose } = renderFlow();

    await user.click(screen.getByRole('button', { name: 'Retour' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ForgotPasswordFlow — Arabic (RTL)', () => {
  it('renders Arabic copy', async () => {
    await i18n.changeLanguage('ar');
    renderFlow();

    expect(screen.getByRole('heading', { name: 'إعادة تعيين كلمة المرور' })).toBeInTheDocument();
    expect(screen.getByLabelText('رمز الاسترداد')).toBeInTheDocument();

    await i18n.changeLanguage('fr');
  });
});
