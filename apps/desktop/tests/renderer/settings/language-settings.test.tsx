import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageSettings } from '../../../src/renderer/components/settings/language-settings';
import i18n from '../../../src/renderer/i18n/config';

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LanguageSettings />
    </QueryClientProvider>,
  );
}

afterEach(async () => {
  vi.restoreAllMocks();
  await i18n.changeLanguage('fr');
});

describe('Language settings', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('marks French pressed and persists + switches to Arabic on click', async () => {
    const invoke = vi.fn(async () => ({ ok: true as const }));
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderSettings();

    expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'العربية' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'العربية' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('preferences.locale.set', { locale: 'ar' }),
    );
    await waitFor(() => expect(i18n.language).toBe('ar'));
  });

  it('still switches the in-session language when persistence fails', async () => {
    window.api.invoke = vi.fn(async () => {
      throw new Error('disk full');
    });
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('button', { name: 'العربية' }));

    await waitFor(() => expect(i18n.language).toBe('ar'));
  });
});
