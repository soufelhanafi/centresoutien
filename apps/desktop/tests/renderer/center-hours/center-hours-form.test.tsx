import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@centresoutien/ui';
import { CenterHoursSettings } from '../../../src/renderer/components/center-hours/center-hours-settings';
import i18n from '../../../src/renderer/i18n/config';

type Window = { open: string; close: string };
type Row = { dayOfWeek: number; windows: Window[] };

const openDay = (dayOfWeek: number): Row => ({ dayOfWeek, windows: [{ open: '09:00', close: '18:00' }] });
const defaultWeek: Row[] = [0, 1, 2, 3, 4, 5, 6].map(openDay);
const closedSunday: Row[] = [{ dayOfWeek: 0, windows: [] }, ...[1, 2, 3, 4, 5, 6].map(openDay)];
const closedMonday: Row[] = [[0].map(openDay)[0]!, { dayOfWeek: 1, windows: [] }, ...[2, 3, 4, 5, 6].map(openDay)];

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

function stubIpcWithWeek(week: Row[]) {
  const invoke = vi.fn(async (channel: string, req: unknown) => {
    if (channel === 'centerHours.get') return { week };
    if (channel === 'centerHours.save') return { week: req };
    return {};
  });
  window.api.invoke = invoke as typeof window.api.invoke;
  return invoke;
}

function windowInput(day: number, windowIndex: number, edge: 'open' | 'close'): HTMLInputElement {
  const input = document.querySelector(`input[name="week.${day}.windows.${windowIndex}.${edge}"]`);
  if (input === null) throw new Error(`missing input week.${day}.windows.${windowIndex}.${edge}`);
  return input as HTMLInputElement;
}

/** Waits for RHF to register the appended window (its inputs mounted in the DOM). */
function waitForWindowInput(day: number, windowIndex: number): Promise<void> {
  return waitFor(() => {
    const open = document.querySelector(`input[name="week.${day}.windows.${windowIndex}.open"]`);
    const close = document.querySelector(`input[name="week.${day}.windows.${windowIndex}.close"]`);
    expect(open).not.toBeNull();
    expect(close).not.toBeNull();
  });
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
    expect(screen.getByText(/fenêtre par défaut de 09:00 à 18:00/)).toBeInTheDocument();

    await user.click(save);

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('centerHours.save', defaultWeek));
    expect(await screen.findByText('Horaires enregistrés')).toBeInTheDocument();
    expect(screen.queryByText(/fenêtre par défaut de 09:00 à 18:00/)).not.toBeInTheDocument();
  });

  it('hides the default-hours hint once dismissed', async () => {
    const user = userEvent.setup();
    stubIpc();
    renderSettings();

    await screen.findByText(/fenêtre par défaut de 09:00 à 18:00/);
    await user.click(screen.getByRole('button', { name: 'Masquer cette information' }));

    expect(screen.queryByText(/fenêtre par défaut de 09:00 à 18:00/)).not.toBeInTheDocument();
  });

  it('does not show the default-hours hint when hours already exist', async () => {
    stubIpcWithWeek(defaultWeek);
    renderSettings();

    await screen.findByRole('button', { name: 'Enregistrer les horaires' });
    expect(screen.queryByText(/fenêtre par défaut de 09:00 à 18:00/)).not.toBeInTheDocument();
  });

  it('closes a day via its toggle and saves an empty window list for it', async () => {
    const invoke = stubIpc();
    const user = userEvent.setup();
    renderSettings();

    await screen.findByRole('button', { name: 'Enregistrer les horaires' });
    await user.click(screen.getByRole('switch', { name: 'Ouvert le Dimanche' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer les horaires' }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('centerHours.save', closedSunday));
  });

  it('adds a second window to a day to model a mid-day break', async () => {
    const invoke = stubIpc();
    const user = userEvent.setup();
    renderSettings();

    await screen.findByRole('button', { name: 'Enregistrer les horaires' });
    // Monday is the second row (index 1), after Sunday. Two windows with a gap:
    // 09:00–12:00 then 14:00–18:00 (the 12:00–14:00 gap is the mid-day break).
    await user.click(screen.getAllByRole('button', { name: 'Ajouter un créneau' })[1]!);
    await waitForWindowInput(1, 1);
    fireEvent.change(windowInput(1, 0, 'close'), { target: { value: '12:00' } });
    fireEvent.change(windowInput(1, 1, 'open'), { target: { value: '14:00' } });
    fireEvent.change(windowInput(1, 1, 'close'), { target: { value: '18:00' } });
    await user.click(screen.getByRole('button', { name: 'Enregistrer les horaires' }));

    const expected = defaultWeek.map((row, index) =>
      index === 1
        ? { dayOfWeek: 1, windows: [{ open: '09:00', close: '12:00' }, { open: '14:00', close: '18:00' }] }
        : row,
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('centerHours.save', expected));
  });

  it('removes a day’s only window, leaving the day closed', async () => {
    const invoke = stubIpc();
    const user = userEvent.setup();
    renderSettings();

    await screen.findByRole('button', { name: 'Enregistrer les horaires' });
    // Monday (index 1) loses its only window → it becomes a closed day.
    await user.click(screen.getAllByRole('button', { name: 'Supprimer le créneau' })[1]!);
    // Monday closed → its window inputs unmount.
    await waitFor(() => expect(document.querySelector('input[name="week.1.windows.0.open"]')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Enregistrer les horaires' }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('centerHours.save', closedMonday));
  });

  it('rejects overlapping windows with the mapped error message', async () => {
    const invoke = stubIpc();
    const user = userEvent.setup();
    renderSettings();

    await screen.findByRole('button', { name: 'Enregistrer les horaires' });
    // Both windows default to 09:00–18:00, so the appended one overlaps the first.
    await user.click(screen.getAllByRole('button', { name: 'Ajouter un créneau' })[1]!);
    await waitForWindowInput(1, 1);
    await user.click(screen.getByRole('button', { name: 'Enregistrer les horaires' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Les créneaux d'un même jour ne doivent pas se chevaucher");
    expect(invoke).not.toHaveBeenCalledWith('centerHours.save', expect.anything());
  });

  it('rejects unsorted windows with the mapped error message', async () => {
    const invoke = stubIpc();
    const user = userEvent.setup();
    renderSettings();

    await screen.findByRole('button', { name: 'Enregistrer les horaires' });
    await user.click(screen.getAllByRole('button', { name: 'Ajouter un créneau' })[1]!);
    await waitForWindowInput(1, 1);
    // The appended window opens before the first one → out of order.
    fireEvent.change(windowInput(1, 1, 'open'), { target: { value: '08:00' } });
    await user.click(screen.getByRole('button', { name: 'Enregistrer les horaires' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Classez les créneaux du plus tôt au plus tard');
    expect(invoke).not.toHaveBeenCalledWith('centerHours.save', expect.anything());
  });
});

describe('CenterHoursSettings — Arabic (RTL)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it('renders Arabic labels and lets the admin add a window', async () => {
    const invoke = stubIpc();
    const user = userEvent.setup();
    renderSettings();

    expect(await screen.findByRole('button', { name: 'حفظ المواعيد' })).toBeInTheDocument();
    expect(screen.getByText('مواعيد العمل')).toBeInTheDocument();
    expect(screen.getByText(/نافذة افتراضية من 09:00 إلى 18:00/)).toBeInTheDocument();
    expect(screen.getByText('الإثنين')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'إضافة فترة زمنية' })[0]).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'إضافة فترة زمنية' })[1]!);
    await waitForWindowInput(1, 1);
    fireEvent.change(windowInput(1, 0, 'close'), { target: { value: '12:00' } });
    fireEvent.change(windowInput(1, 1, 'open'), { target: { value: '14:00' } });
    fireEvent.change(windowInput(1, 1, 'close'), { target: { value: '18:00' } });
    await user.click(screen.getByRole('button', { name: 'حفظ المواعيد' }));

    const expected = defaultWeek.map((row, index) =>
      index === 1
        ? { dayOfWeek: 1, windows: [{ open: '09:00', close: '12:00' }, { open: '14:00', close: '18:00' }] }
        : row,
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('centerHours.save', expected));
  });
});
