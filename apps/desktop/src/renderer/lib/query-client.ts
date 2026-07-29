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
