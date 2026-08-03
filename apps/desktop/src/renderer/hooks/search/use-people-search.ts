import { useQuery } from '@tanstack/react-query';
import { searchGateway } from '../../lib/search/search-gateway';
import { searchKeys } from './keys';

/**
 * Runs the global people search for a (debounced) query. Disabled while the query
 * is empty so an open-but-untouched palette issues no call. Data access goes
 * through the {@link searchGateway} seam, not `window.api` directly.
 */
export function usePeopleSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: searchKeys.people(trimmed),
    queryFn: () => searchGateway.searchPeople(trimmed),
    enabled: trimmed.length > 0,
    refetchOnWindowFocus: false,
  });
}
