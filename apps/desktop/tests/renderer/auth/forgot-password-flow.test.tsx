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

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

afterEach(() => {
  vi.restoreAllMocks();
  setOnline(true);
});

describe('ForgotPasswordFlow — French', () => {
  it('resets via a recovery code and lands on the fresh-login notice', async () => {
    const invoke = vi.fn(async () => ({ outcome: 'success' }));
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole('button', { name: /Code de récupération/ }));
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

  it('reaches the security-questions path as a last resort', async () => {
    renderFlow();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Questions de sécurité/ }));

    expect(await screen.findByRole('combobox', { name: 'Question 1' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Question 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vérifier et continuer' })).toBeInTheDocument();
  });

  it('offers the email option (disabled) only when online', async () => {
    setOnline(true);
    const { onClose } = renderFlow();
    expect(screen.getByText('Bientôt disponible')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hides the email option when offline', async () => {
    setOnline(false);
    renderFlow();
    expect(screen.queryByText('Bientôt disponible')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Code de récupération/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Questions de sécurité/ })).toBeInTheDocument();
  });
});

describe('ForgotPasswordFlow — Arabic (RTL)', () => {
  it('renders Arabic copy', async () => {
    await i18n.changeLanguage('ar');
    renderFlow();

    expect(screen.getByRole('heading', { name: 'إعادة تعيين كلمة المرور' })).toBeInTheDocument();
    expect(screen.getByText('اختر طريقة استعادة الوصول إلى حسابك.')).toBeInTheDocument();

    await i18n.changeLanguage('fr');
  });
});
