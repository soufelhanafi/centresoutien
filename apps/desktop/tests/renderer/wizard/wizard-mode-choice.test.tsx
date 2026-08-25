import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FirstRunWizard } from '../../../src/renderer/components/wizard/first-run-wizard';
import { useWizardStore } from '../../../src/renderer/stores/wizard-store';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import i18n from '../../../src/renderer/i18n/config';

function renderWizard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FirstRunWizard onComplete={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useWizardStore.setState({ mode: 'choose', state: null, adminUsername: '' });
  usePlanStore.getState().setPlan('essentiel');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FirstRunWizard — mode choice (SOU-318)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('offers both create and join before any wizard step', () => {
    window.api.invoke = vi.fn(async () => ({}));
    renderWizard();

    expect(screen.getByText('Créer un nouveau centre')).toBeInTheDocument();
    expect(screen.getByText('Rejoindre un centre existant')).toBeInTheDocument();
    // The language step has not started yet.
    expect(screen.queryByText('Choisissez la langue')).not.toBeInTheDocument();
  });

  it('enters the create step machine when "Créer un nouveau centre" is chosen', async () => {
    window.api.invoke = vi.fn(async () => ({}));
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByText('Créer un nouveau centre'));

    expect(await screen.findByText('Choisissez la langue')).toBeInTheDocument();
  });

  it('enters the LAN discovery branch when "Rejoindre un centre existant" is chosen', async () => {
    window.api.invoke = vi.fn(async (channel: string) =>
      channel === 'hub.discoverCenters' ? { centers: [] } : {},
    );
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByText('Rejoindre un centre existant'));

    expect(await screen.findByText('Rechercher un centre')).toBeInTheDocument();
  });

  it('renders the mode choice in Arabic', async () => {
    await i18n.changeLanguage('ar');
    window.api.invoke = vi.fn(async () => ({}));
    renderWizard();

    expect(screen.getByText('إنشاء مركز جديد')).toBeInTheDocument();
    expect(screen.getByText('الانضمام إلى مركز موجود')).toBeInTheDocument();
    await i18n.changeLanguage('fr');
  });
});
