import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@centresoutien/ui';
import { CenterHoursSettings } from '../../../src/renderer/components/center-hours/center-hours-settings';
import i18n from '../../../src/renderer/i18n/config';

type Row = { dayOfWeek: number; open: string | null; close: string | null };

const openDay = (dayOfWeek: number): Row => ({ dayOfWeek, open: '09:00', close: '18:00' });
const defaultWeek: Row[] = [0, 1, 2, 3, 4, 5, 6].map(openDay);

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CenterHoursSettings />
      <Toaster />
    </QueryClientProvider>,
  );
}

/** Fresh center: `get` returns no rows, `save` echoes what it received. */
function stubIpc() {
  const invoke = vi.fn(async (channel: string, req: unknown) => {
    if (channel === 'centerHours.get') return { week: [] };
    if (channel === 'centerHours.save') return { week: req };
    return {};
  });
  window.api.invoke = invoke as typeof window.api.invoke;
  return invoke;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CenterHoursSettings — French', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('seeds and saves the default week (all days open 09:00–18:00)', async () => {
    const invoke = stubIpc();
    const user = userEvent.setup();
    renderSettings();

    const save = await screen.findByRole('button', { name: 'Enregistrer les horaires' });
    expect(screen.getByText('Lundi')).toBeInTheDocument();

    await user.click(save);

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('centerHours.save', defaultWeek));
    expect(await screen.findByText('Horaires enregistrés')).toBeInTheDocument();
  });

  it('closes a day via its toggle and saves null hours for it', async () => {
    const invoke = stubIpc();
    const user = userEvent.setup();
    renderSettings();

    await screen.findByRole('button', { name: 'Enregistrer les horaires' });
    await user.click(screen.getByRole('switch', { name: 'Ouvert le Dimanche' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer les horaires' }));

    const expected: Row[] = [{ dayOfWeek: 0, open: null, close: null }, ...[1, 2, 3, 4, 5, 6].map(openDay)];
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('centerHours.save', expected));
  });
});

describe('CenterHoursSettings — Arabic (RTL)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it('renders Arabic labels', async () => {
    stubIpc();
    renderSettings();

    expect(await screen.findByRole('button', { name: 'حفظ المواعيد' })).toBeInTheDocument();
    expect(screen.getByText('مواعيد العمل')).toBeInTheDocument();
    expect(screen.getByText('الإثنين')).toBeInTheDocument();
  });
});
