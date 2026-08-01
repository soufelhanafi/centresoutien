import type { SubjectScope } from '../../lib/subjects/subject-view';

/**
 * Query keys for the subjects module. Every write hook (create/update/archive)
 * invalidates the `all` prefix, so both name-resolution lists and the
 * usage-with-count CRUD table refetch together.
 */
export const subjectKeys = {
  all: ['subjects'] as const,
  list: (scope: SubjectScope) => ['subjects', 'list', scope] as const,
  usage: ['subjects', 'usage'] as const,
};
