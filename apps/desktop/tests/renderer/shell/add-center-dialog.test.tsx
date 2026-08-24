import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';

const navigateSpy = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useNavigate: () => navigateSpy,
}));

const { createCenterMock } = vi.hoisted(() => ({
  createCenterMock: vi.fn(async () => ({ centreId: 'ctr_new_001', centerCode: 'CS-NEW-001' })),
}));
vi.mock('../../../src/renderer/lib/center/center-gateway-instance', () => ({
  centerGateway: {
    list: vi.fn(),
    current: vi.fn(),
    switchTo: vi.fn(),
    createCenter: createCenterMock,
  },
}));

import { AddCenterDialog } from '../../../src/renderer/components/shell/add-center-dialog';
import i18n from '../../../src/renderer/i18n/config';

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AddCenterDialog open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  navigateSpy.mockClear();
  createCenterMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AddCenterDialog (SOU-310)', () => {
  it('provisions a center from the profile and lands in it on submit', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(await screen.findByLabelText('Nom du centre'), 'Centre Annexe');
    await user.click(screen.getByRole('button', { name: 'Créer le centre' }));

    await waitFor(() =>
      expect(createCenterMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Centre Annexe' }),
      ),
    );
    expect(navigateSpy).toHaveBeenCalledWith({ to: '/dashboard' });
  });

  it('blocks submission and never provisions when the name is blank', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Créer le centre' }));

    await waitFor(() => expect(screen.getByLabelText('Nom du centre')).toHaveAttribute('aria-invalid', 'true'));
    expect(createCenterMock).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
