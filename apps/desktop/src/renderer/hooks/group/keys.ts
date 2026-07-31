import type { GroupStatus } from '../../lib/groups/group-view';

/** Query keys for the groups module. Mutations invalidate `groupKeys.all`. */
export const groupKeys = {
  all: ['groups'] as const,
  list: (status: GroupStatus) => ['groups', 'list', status] as const,
  detail: (id: string) => ['groups', 'detail', id] as const,
  roster: (id: string) => ['groups', 'roster', id] as const,
  enrollable: (id: string) => ['groups', 'enrollable', id] as const,
  options: () => ['groups', 'options'] as const,
};
