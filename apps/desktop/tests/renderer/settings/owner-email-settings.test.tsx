import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OwnerEmailSettings } from '../../../src/renderer/components/settings/owner-email-settings';
import i18n from '../../../src/renderer/i18n/config';
import { encodeDomainError } from '../../../src/shared/ipc/domain-error';

function mockInvoke(overrides: Record<string, (...args: unknown[]) => unknown> = {}) {
  return vi.fn(async (channel: string, ...args: unknown[]) => {
    if (channel in overrides) return overrides[channel]?.(...args);
    switch (channel) {
      case 'account.ownerEmail.get':
        return { email: null };
      case 'account.ownerEmail.set':
        return { email: (args[0] as { email: string | null }).email };
      default:
        return {};
    }
  });
}

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OwnerEmailSettings />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Owner email settings — French', () => {
  it('prefills the loaded address and saves the normalized value over IPC', async () => {
    const invoke = mockInvoke({
      'account.ownerEmail.get': () => ({ email: 'owner@example.com' }),
    });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderSection();

    const field = (await screen.findByLabelText('Adresse e-mail')) as HTMLInputElement;
    expect(field.value).toBe('owner@example.com');

    await user.clear(field);
    await user.type(field, 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('account.ownerEmail.set', { email: 'new@example.com' }),
    );
  });

  it('clears the stored address when submitted empty', async () => {
    const invoke = mockInvoke({
      'account.ownerEmail.get': () => ({ email: 'owner@example.com' }),
    });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderSection();

    const field = await screen.findByLabelText('Adresse e-mail');
    await user.clear(field);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('account.ownerEmail.set', { email: null }),
    );
  });

  it('blocks submit and shows a format error for an invalid address, without calling IPC', async () => {
    const invoke = mockInvoke();
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderSection();

    await user.type(await screen.findByLabelText('Adresse e-mail'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Adresse e-mail invalide')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('account.ownerEmail.set', expect.anything());
  });

  it('surfaces the domain invalid-email rejection inline on the field', async () => {
    window.api.invoke = mockInvoke({
      'account.ownerEmail.set': () => {
        const encoded = encodeDomainError({ code: 'invalid-email', message: 'boom' });
        throw new Error(`Error invoking remote method 'account.ownerEmail.set': Error: ${encoded}`);
      },
    });
    const user = userEvent.setup();
    renderSection();

    // A client-valid address that the (mocked) domain rejects — proves the
    // server-side error path maps to the field, not a toast.
    await user.type(await screen.findByLabelText('Adresse e-mail'), 'valid@example.com');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Adresse e-mail invalide')).toBeInTheDocument();
  });

  it('shows a retryable error state when the address fails to load', async () => {
    window.api.invoke = mockInvoke({
      'account.ownerEmail.get': () => {
        throw new Error('boom');
      },
    });
    renderSection();

    expect(await screen.findByText("Impossible de charger l'adresse e-mail")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});

describe('Owner email settings — Arabic (RTL)', () => {
  it('renders Arabic labels', async () => {
    await i18n.changeLanguage('ar');
    window.api.invoke = mockInvoke();
    renderSection();

    expect(await screen.findByLabelText('عنوان البريد الإلكتروني')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حفظ' })).toBeInTheDocument();

    await i18n.changeLanguage('fr');
  });
});
