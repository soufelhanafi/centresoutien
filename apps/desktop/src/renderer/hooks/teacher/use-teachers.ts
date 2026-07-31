import { useQuery } from '@tanstack/react-query';
import { teachersGateway } from '../../lib/teachers/teachers-gateway';
import { teacherKeys } from './keys';

/**
 * Loads the teacher list, filtered by `search` (FR/AR name or phone). Data access
 * goes through the {@link teachersGateway} seam, not `window.api` directly, so the
 * adapter is swappable in a single place.
 */
export function useTeachers(search: string) {
  return useQuery({
    queryKey: teacherKeys.list(search),
    queryFn: () => teachersGateway.list({ search }),
    refetchOnWindowFocus: false,
  });
}
