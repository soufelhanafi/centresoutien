import { useQuery } from '@tanstack/react-query';
import type { SubjectScope } from '../../lib/subjects/subject-view';
import { subjectsGateway } from '../../lib/subjects/subjects-gateway';
import { subjectKeys } from './keys';

/**
 * Loads the subject list for one scope — `active` (the assignable picker set) or
 * `all` (every live subject, for resolving names of links already held). Data
 * access goes through the {@link subjectsGateway} seam, not `window.api` directly,
 * so the adapter is swappable in a single place.
 */
export function useSubjects(scope: SubjectScope) {
  return useQuery({
    queryKey: subjectKeys.list(scope),
    queryFn: () => subjectsGateway.list(scope),
    refetchOnWindowFocus: false,
  });
}
