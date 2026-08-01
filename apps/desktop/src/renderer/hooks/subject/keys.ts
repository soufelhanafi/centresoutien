import type { SubjectScope } from '../../lib/subjects/subject-view';

/**
 * Query keys for the subjects module. `useCreateSubject` invalidates the `all`
 * prefix, so every scoped list refetches after a create.
 */
export const subjectKeys = {
  all: ['subjects'] as const,
  list: (scope: SubjectScope) => ['subjects', 'list', scope] as const,
};
