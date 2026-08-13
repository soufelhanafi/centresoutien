import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LicenseGate } from '../../../src/renderer/components/license/license-gate';
import { licenseApi } from '../../../src/renderer/lib/license/license-api';
import i18n from '../../../src/renderer/i18n/config';

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LicenseGate>
        <div>app-content</div>
      </LicenseGate>
    </QueryClientProvider>,
  );
}

const trial = {
  startedAt: '2026-08-13T00:00:00.000Z',
  expiresAt: '2026-08-27T00:00:00.000Z',
};

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LicenseGate', () => {
  it('admits an active trial to the application', async () => {
    vi.spyOn(licenseApi, 'status').mockResolvedValue({
      status: 'trial-active',
      plan: 'essentiel',
      restricted: false,
      expiresAt: null,
      centersAllowed: null,
      founderDiscountExpiresAt: null,
      founderDiscountExpired: false,
      trial,
    });

    renderGate();

    expect(await screen.findByText('app-content')).toBeInTheDocument();
  });

  it('keeps an expired trial locked and displays its end date', async () => {
    vi.spyOn(licenseApi, 'status').mockResolvedValue({
      status: 'trial-expired',
      plan: 'essentiel',
      restricted: true,
      expiresAt: null,
      centersAllowed: null,
      founderDiscountExpiresAt: null,
      founderDiscountExpired: false,
      trial,
    });

    renderGate();

    expect((await screen.findAllByText("Période d'essai terminée")).length).toBeGreaterThan(0);
    expect(screen.queryByText('app-content')).not.toBeInTheDocument();
    expect(screen.getByText('27 août 2026')).toBeInTheDocument();
  });
});
