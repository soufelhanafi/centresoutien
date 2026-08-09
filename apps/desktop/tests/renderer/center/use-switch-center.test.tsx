import { type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';

const navigateSpy = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useNavigate: () => navigateSpy,
}));

import { useSwitchCenter } from '../../../src/renderer/hooks/center/use-switch-center';
import { useDashboardViewStore } from '../../../src/renderer/stores/dashboard-view-store';
import { useCommandPaletteStore } from '../../../src/renderer/stores/command-palette-store';

/**
 * SOU-96 — switching centers must leave no cross-tenant residue: the whole
 * TanStack cache is dropped, device-scoped UI stores reset, and the app lands on
 * the new center's dashboard. This is the sharp acceptance-criteria risk.
 */
function renderSwitch(client: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSwitchCenter(), { wrapper });
}

describe('useSwitchCenter — cache reset', () => {
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

    const { result } = renderSwitch(client);
    await result.current.mutateAsync('ctr_rabat_002');

    await waitFor(() => {
      expect(client.getQueryData(['students', 'list'])).toBeUndefined();
    });
    expect(useDashboardViewStore.getState().view).toBe('basic');
    expect(useCommandPaletteStore.getState().open).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith({ to: '/dashboard' });
  });

  it('surfaces an error and leaves caches untouched when the switch is rejected', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(['students', 'list'], [{ id: 'stu_1' }]);

    const { result } = renderSwitch(client);
    await expect(result.current.mutateAsync('ctr_does_not_exist')).rejects.toThrow();

    expect(client.getQueryData(['students', 'list'])).toEqual([{ id: 'stu_1' }]);
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
