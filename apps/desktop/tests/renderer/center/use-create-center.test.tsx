import { type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import type { CenterProfileInput } from '@centresoutien/domain';

const navigateSpy = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useNavigate: () => navigateSpy,
}));

vi.mock('../../../src/renderer/lib/center/center-gateway-instance', async () => {
  const { createMockCenterGateway } = await import('../../../src/renderer/lib/center/center-gateway.mock');
  return { centerGateway: createMockCenterGateway() };
});

import { useCreateCenter } from '../../../src/renderer/hooks/center/use-create-center';
import { useDashboardViewStore } from '../../../src/renderer/stores/dashboard-view-store';
import { useCommandPaletteStore } from '../../../src/renderer/stores/command-palette-store';

/**
 * SOU-310 — creating a center provisions a new isolated DB and lands in it, so it
 * must leave no cross-tenant residue exactly like a switch: the whole TanStack
 * cache is dropped, device-scoped UI stores reset, and the app lands on the new
 * center's dashboard.
 */
function renderCreate(client: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCreateCenter(), { wrapper });
}

const PROFILE: CenterProfileInput = { name: 'Centre Annexe', address: '', phone: '', email: '' };

describe('useCreateCenter — lands in the new center with a clean slate', () => {
  afterEach(() => {
    navigateSpy.mockClear();
    useDashboardViewStore.getState().reset();
    useCommandPaletteStore.getState().setOpen(false);
  });

  it('clears every query cache, resets UI stores, and navigates to the dashboard', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(['students', 'list'], [{ id: 'stu_1' }]);
    useDashboardViewStore.getState().setView('advanced');
    useCommandPaletteStore.getState().setOpen(true);

    const { result } = renderCreate(client);
    const created = await result.current.mutateAsync(PROFILE);

    expect(created.centreId).toMatch(/^ctr_new_/);
    await waitFor(() => {
      expect(client.getQueryData(['students', 'list'])).toBeUndefined();
    });
    expect(useDashboardViewStore.getState().view).toBe('basic');
    expect(useCommandPaletteStore.getState().open).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith({ to: '/dashboard' });
  });
});
