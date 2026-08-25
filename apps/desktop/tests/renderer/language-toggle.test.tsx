import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageToggle } from '../../src/renderer/components/language-toggle';
import i18n from '../../src/renderer/i18n/config';

function renderToggle() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LanguageToggle />
    </QueryClientProvider>,
  );
}

afterEach(async () => {
  vi.restoreAllMocks();
  await i18n.changeLanguage('fr');
});

describe('Language toggle', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('persists the switched locale to disk, not just the running session', async () => {
    const invoke = vi.fn(async () => ({ ok: true as const }));
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole('button'));

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
    renderToggle();

    await user.click(screen.getByRole('button'));

    await waitFor(() => expect(i18n.language).toBe('ar'));
  });
});
