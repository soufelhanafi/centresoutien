import { useGroups } from '../../hooks/group/use-groups';
import type { GroupStatus } from '../../lib/groups/group-view';
import { GroupListContent, type GroupListStatus } from './group-list-content';
import { applyGroupFilters, isFiltering, type GroupFilters } from './group-filters';

/**
 * Connects one lifecycle list (active or archived) to its query, applies the
 * shared subject/level/kind filters, and derives the display state. Both tabs
 * render this same panel with a different `variant`.
 */
export function GroupListPanel({
  variant,
  filters,
  onCreate,
}: {
  variant: GroupStatus;
  filters: GroupFilters;
  onCreate: () => void;
}) {
  const query = useGroups(variant);
  const groups = applyGroupFilters(query.data ?? [], filters);
  const filtered = isFiltering(filters);

  const status: GroupListStatus = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : groups.length > 0
        ? 'ready'
        : filtered
          ? 'noResults'
          : 'empty';

  return (
    <GroupListContent
      status={status}
      variant={variant}
      groups={groups}
      onRetry={() => void query.refetch()}
      onCreate={onCreate}
    />
  );
}
