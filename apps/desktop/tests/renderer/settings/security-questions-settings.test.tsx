import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SECURITY_QUESTION_KEYS } from '@centresoutien/domain';
import { SecurityQuestionsSettings } from '../../../src/renderer/components/settings/security-questions-settings';
import i18n from '../../../src/renderer/i18n/config';

function mockInvoke(overrides: Record<string, (...args: unknown[]) => unknown> = {}) {
  return vi.fn(async (channel: string, ...args: unknown[]) => {
    if (channel in overrides) return overrides[channel]?.(...args);
    switch (channel) {
      case 'admin.securityQuestions.bank':
        return { keys: SECURITY_QUESTION_KEYS };
      case 'admin.securityQuestions.exists':
        return { exists: false };
      case 'admin.securityQuestions.set':
        return { ok: true };
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
      <SecurityQuestionsSettings />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Security questions settings — French', () => {
  it('submits the three default questions with their answers over IPC', async () => {
    const invoke = mockInvoke();
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderSection();

    expect(await screen.findByRole('combobox', { name: 'Question 1' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Réponse 1'), 'Al Amal');
    await user.type(screen.getByLabelText('Réponse 2'), 'Rue Hassan II');
    await user.type(screen.getByLabelText('Réponse 3'), 'Dacia');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('admin.securityQuestions.set', {
        questions: [
          { questionKey: 'first-employer', answer: 'Al Amal' },
          { questionKey: 'childhood-street', answer: 'Rue Hassan II' },
          { questionKey: 'first-car', answer: 'Dacia' },
        ],
      }),
    );
  });

  it('shows a notice when questions are already configured', async () => {
    window.api.invoke = mockInvoke({
      'admin.securityQuestions.exists': () => ({ exists: true }),
    });
    renderSection();

    expect(
      await screen.findByText('Des questions sont déjà configurées. Les enregistrer ci-dessous les remplace.'),
    ).toBeInTheDocument();
  });

  it('shows a retryable error state when the bank fails to load', async () => {
    const invoke = mockInvoke({
      'admin.securityQuestions.bank': () => {
        throw new Error('boom');
      },
    });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderSection();

    expect(await screen.findByText('Impossible de charger les questions de sécurité')).toBeInTheDocument();

    invoke.mockImplementation(async (channel: string) => {
      switch (channel) {
        case 'admin.securityQuestions.bank':
          return { keys: SECURITY_QUESTION_KEYS };
        case 'admin.securityQuestions.exists':
          return { exists: false };
        default:
          return {};
      }
    });
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByRole('combobox', { name: 'Question 1' })).toBeInTheDocument();
  });
});

describe('Security questions settings — Arabic (RTL)', () => {
  it('renders Arabic labels', async () => {
    await i18n.changeLanguage('ar');
    window.api.invoke = mockInvoke();
    renderSection();

    expect(await screen.findByRole('combobox', { name: 'السؤال 1' })).toBeInTheDocument();
    expect(screen.getByLabelText('الإجابة 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حفظ' })).toBeInTheDocument();

    await i18n.changeLanguage('fr');
  });
});
