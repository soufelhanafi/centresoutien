import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppHeader } from '../../src/renderer/components/shell/app-header';
import i18n from '../../src/renderer/i18n/config';

/**
 * SOU-113 — the app-shell header shows the persisted center name (via the
 * existing `center.get` read path) instead of a hardcoded placeholder. It falls
 * back to the localized placeholder while loading / when no center row exists.
 */
function renderHeader() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AppHeader />
    </QueryClientProvider>,
  );
}

describe('AppHeader — center name', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the localized placeholder when no center row exists yet', async () => {
    window.api.invoke = vi.fn(async (channel: string) =>
      channel === 'center.get' ? { center: null } : {},
    );
    renderHeader();
    expect(await screen.findByText('Centre principal')).toBeInTheDocument();
  });

  it('shows the persisted center name instead of the placeholder', async () => {
    const savedCenter = {
      name: 'Centre Al Amal',
      address: '',
      phone: '',
      email: '',
      logoPath: null,
      plan: 'essentiel' as const,
    };
    window.api.invoke = vi.fn(async (channel: string) =>
      channel === 'center.get' ? { center: savedCenter } : {},
    );
    renderHeader();
    expect(await screen.findByText('Centre Al Amal')).toBeInTheDocument();
    expect(screen.queryByText('Centre principal')).not.toBeInTheDocument();
  });

  it('falls back to the localized placeholder on a failed read', async () => {
    window.api.invoke = vi.fn(async () => {
      throw new Error('read failure');
    });
    renderHeader();
    expect(await screen.findByText('Centre principal')).toBeInTheDocument();
  });

  it('reflects a saved center name under the Arabic (RTL) locale', async () => {
    await i18n.changeLanguage('ar');
    window.api.invoke = vi.fn(async (channel: string) =>
      channel === 'center.get'
        ? { center: { name: 'مركز الأمل', address: '', phone: '', email: '', logoPath: null, plan: 'essentiel' } }
        : {},
    );
    renderHeader();
    expect(await screen.findByText('مركز الأمل')).toBeInTheDocument();
  });
});
