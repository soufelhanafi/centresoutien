import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PLANS } from '@centresoutien/domain';
import { CenterProfileSettings } from '../../../src/renderer/components/settings/settings-page';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import i18n from '../../../src/renderer/i18n/config';

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CenterProfileSettings />
    </QueryClientProvider>,
  );
}

const savedCenter = {
  name: 'Centre Al Amal',
  address: '',
  phone: '',
  email: '',
  logoPath: null,
  plan: 'essentiel' as const,
};

beforeEach(() => {
  usePlanStore.setState({ planId: 'essentiel', plan: PLANS.essentiel });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Center profile — French', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('blocks submit and shows the required error on an empty name, without saving', async () => {
    const invoke = vi.fn(async (channel: string) =>
      channel === 'center.get' ? { center: null } : {},
    );
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderSettings();

    await screen.findByLabelText('Nom du centre');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Ce champ est requis')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('center.save', expect.anything());
  });

  it('upserts the profile over IPC with a null logo when none is picked', async () => {
    const invoke = vi.fn(async (channel: string) =>
      channel === 'center.get' ? { center: null } : { center: savedCenter },
    );
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderSettings();

    await user.type(await screen.findByLabelText('Nom du centre'), 'Centre Al Amal');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('center.save', {
        name: 'Centre Al Amal',
        address: '',
        phone: '',
        email: '',
        logoPath: null,
      }),
    );
  });

  it('renders the plan read-only — a badge, never an editable field', async () => {
    window.api.invoke = vi.fn(async () => ({ center: null }));
    renderSettings();

    expect(await screen.findByText('ESSENTIEL')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Formule' })).not.toBeInTheDocument();
  });
});

describe('Center profile — Arabic (RTL)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it('renders Arabic labels and the Arabic required error', async () => {
    window.api.invoke = vi.fn(async () => ({ center: null }));
    const user = userEvent.setup();
    renderSettings();

    expect(await screen.findByLabelText('اسم المركز')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    expect(await screen.findByText('هذا الحقل مطلوب')).toBeInTheDocument();
  });
});
