import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LogoField } from '../../../src/renderer/components/settings/logo-field';
import i18n from '../../../src/renderer/i18n/config';

function renderField(savedPath: string | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LogoField savedPath={savedPath} onChange={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  // jsdom implements neither createObjectURL nor revokeObjectURL.
  URL.createObjectURL = vi.fn(() => 'blob:mock-logo');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LogoField — persisted logo re-display (M2)', () => {
  it('reads a saved logo back over center.logoBytes and renders it in an <img>', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const invoke = vi.fn(async (channel: string) =>
      channel === 'center.logoBytes' ? { bytes } : {},
    );
    window.api.invoke = invoke;

    renderField('logos/centre.png');

    const img = await screen.findByAltText('Logo du centre');
    expect(img).toHaveAttribute('src', 'blob:mock-logo');
    expect(invoke).toHaveBeenCalledWith('center.logoBytes', { path: 'logos/centre.png' });
  });

  it('falls back to the placeholder when the stored file is missing (null bytes)', async () => {
    const invoke = vi.fn(async () => ({ bytes: null }));
    window.api.invoke = invoke;

    renderField('logos/missing.png');

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('center.logoBytes', { path: 'logos/missing.png' }));
    expect(screen.queryByAltText('Logo du centre')).not.toBeInTheDocument();
  });

  it('never requests bytes when there is no saved logo', async () => {
    const invoke = vi.fn(async () => ({ bytes: null }));
    window.api.invoke = invoke;

    renderField(null);

    expect(invoke).not.toHaveBeenCalledWith('center.logoBytes', expect.anything());
    expect(screen.queryByAltText('Logo du centre')).not.toBeInTheDocument();
  });
});
