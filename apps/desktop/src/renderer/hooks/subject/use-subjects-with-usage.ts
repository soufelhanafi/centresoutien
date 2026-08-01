import { useQuery } from '@tanstack/react-query';
import { subjectsGateway } from '../../lib/subjects/subjects-gateway';
import { subjectKeys } from './keys';

/**
 * Loads every live subject paired with its in-use count and named reference
 * breakdown — the read model backing the SOU-47 CRUD table's Active/Inactive
 * tabs (split client-side by `subject.active`, both tabs share this one query).
 * Data access goes through the {@link subjectsGateway} seam, not `window.api`
 * directly, so the adapter is swappable in a single place.
 */
export function useSubjectsWithUsage() {
  return useQuery({
    queryKey: subjectKeys.usage,
    queryFn: () => subjectsGateway.listWithUsage(),
    refetchOnWindowFocus: false,
  });
}
