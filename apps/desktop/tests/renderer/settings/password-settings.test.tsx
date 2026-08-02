import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PasswordSettings } from '../../../src/renderer/components/settings/password-settings';
import i18n from '../../../src/renderer/i18n/config';
import { encodeDomainError } from '../../../src/shared/ipc/domain-error';

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PasswordSettings />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Password settings — French', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('submits current + new password over IPC, without the confirmation field', async () => {
    const invoke = vi.fn(async () => ({ ok: true as const }));
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Mot de passe actuel'), 'OldPass1');
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'NewPass2');
    await user.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), 'NewPass2');
    await user.click(screen.getByRole('button', { name: 'Mettre à jour' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('admin.changePassword', {
        currentPassword: 'OldPass1',
        newPassword: 'NewPass2',
      }),
    );
  });

  it('blocks submit and shows a mismatch error when confirmation differs, without calling IPC', async () => {
    const invoke = vi.fn(async () => ({ ok: true as const }));
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Mot de passe actuel'), 'OldPass1');
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'NewPass2');
    await user.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), 'Different1');
    await user.click(screen.getByRole('button', { name: 'Mettre à jour' }));

    expect(await screen.findByText('Les mots de passe ne correspondent pas')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('shows the wrong-current-password error inline on the current-password field', async () => {
    window.api.invoke = vi.fn(async () => {
      const encoded = encodeDomainError({ code: 'InvalidCurrentPasswordError', message: 'boom' });
      throw new Error(`Error invoking remote method 'admin.changePassword': Error: ${encoded}`);
    });
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Mot de passe actuel'), 'WrongPass1');
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'NewPass2');
    await user.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), 'NewPass2');
    await user.click(screen.getByRole('button', { name: 'Mettre à jour' }));

    expect(await screen.findByText('Mot de passe actuel incorrect')).toBeInTheDocument();
  });

  it('shows a weak-new-password rejection inline on the new-password field, not a toast', async () => {
    window.api.invoke = vi.fn(async () => {
      throw new Error(
        'Error invoking remote method \'admin.changePassword\': ZodError: [{"code":"custom","message":"password-needs-digit","path":["newPassword"]}]',
      );
    });
    const user = userEvent.setup();
    renderForm();

    // A value that satisfies the client-side zodResolver so submit actually
    // reaches the mocked IPC rejection above — proving the *server-side*
    // defense-in-depth mapping (dispatcher-level Zod re-validation), which is
    // the only realistic way this branch is reached in production.
    await user.type(screen.getByLabelText('Mot de passe actuel'), 'OldPass1');
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'NewPass1');
    await user.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), 'NewPass1');
    await user.click(screen.getByRole('button', { name: 'Mettre à jour' }));

    expect(await screen.findByText('Ajoutez au moins un chiffre')).toBeInTheDocument();
  });
});

describe('Password settings — Arabic (RTL)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it('renders Arabic labels', async () => {
    window.api.invoke = vi.fn(async () => ({ ok: true as const }));
    renderForm();

    expect(await screen.findByLabelText('كلمة المرور الحالية')).toBeInTheDocument();
    expect(screen.getByLabelText('كلمة المرور الجديدة')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تحديث' })).toBeInTheDocument();
  });
});
