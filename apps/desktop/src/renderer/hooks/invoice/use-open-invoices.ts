import { useInfiniteQuery } from '@tanstack/react-query';
import { invoicesGateway } from '../../lib/invoices/invoices-gateway';
import { invoiceKeys } from './keys';

/** One bounded page of the cash-desk open-invoice picker (SOU-200). */
const OPEN_INVOICES_PAGE_SIZE = 20;

/**
 * Loads the center's still-open invoices for the cash-desk picker, keyset-paginated
 * server-side (`openOnly` + name `search`, SOU-200) instead of fetching the whole
 * list and filtering in the renderer. `search` is expected already debounced.
 * Data access goes through the {@link invoicesGateway} seam, never `window.api`.
 */
export function useOpenInvoices(search: string) {
  return useInfiniteQuery({
    queryKey: invoiceKeys.open(search),
    queryFn: ({ pageParam }) =>
      invoicesGateway.listOpen({
        pageSize: OPEN_INVOICES_PAGE_SIZE,
        ...(search !== '' && { search }),
        ...(pageParam !== undefined && { cursor: pageParam }),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchOnWindowFocus: false,
  });
}
