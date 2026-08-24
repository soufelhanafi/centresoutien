import { QueryClient } from '@tanstack/react-query';

/**
 * The renderer's single TanStack Query client. IPC calls are local and fast, so
 * failed calls surface immediately rather than retrying.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

/**
 * Resets the query cache when the open center changes (SOU-314). Query keys are
 * not scoped by center — main injects `centerCode` — so without this the cache
 * keeps the previous center's rows under the same keys. `invalidateQueries`
 * refetches every currently-mounted query in place, so a screen the operator is
 * already looking at (the dashboard) shows the new center's figures with no
 * manual reload; `removeQueries({ type: 'inactive' })` then purges the previous
 * center's cached rows for tenant isolation. The mutation cache is cleared too
 * — a mutation started under the old center must not resolve after the switch
 * and hand stale data back into a non-center-scoped key.
 */
export async function resetQueryCache(client: QueryClient): Promise<void> {
  await client.cancelQueries();
  client.getMutationCache().clear();
  await client.invalidateQueries();
  client.removeQueries({ type: 'inactive' });
}
