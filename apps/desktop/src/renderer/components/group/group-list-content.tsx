import { useTranslation } from 'react-i18next';
import { Boxes, Archive } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '@centresoutien/ui';
import type { GroupRow, GroupStatus } from '../../lib/groups/group-view';
import { GroupTable } from './group-table';

export type GroupListStatus = 'loading' | 'error' | 'empty' | 'noResults' | 'ready';

type GroupListContentProps = {
  status: GroupListStatus;
  variant: GroupStatus;
  groups: readonly GroupRow[];
  onRetry: () => void;
  onCreate: () => void;
};

/** Renders the correct state for one groups list: loading, error, empty, no-results, or table. */
export function GroupListContent({
  status,
  variant,
  groups,
  onRetry,
  onCreate,
}: GroupListContentProps) {
  const { t } = useTranslation();

  if (status === 'loading') {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-4" aria-busy="true">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <EmptyState
        icon={<Boxes className="h-5 w-5" aria-hidden="true" />}
        title={t('groups.loadError.title')}
        description={t('groups.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('groups.loadError.retry')}
          </Button>
        }
      />
    );
  }

  if (status === 'empty') {
    return variant === 'archived' ? (
      <EmptyState
        icon={<Archive className="h-5 w-5" aria-hidden="true" />}
        title={t('groups.archivedEmpty.title')}
        description={t('groups.archivedEmpty.body')}
      />
    ) : (
      <EmptyState
        icon={<Boxes className="h-5 w-5" aria-hidden="true" />}
        title={t('groups.empty.title')}
        description={t('groups.empty.body')}
        action={
          <Button size="sm" onClick={onCreate}>
            {t('groups.empty.cta')}
          </Button>
        }
      />
    );
  }

  if (status === 'noResults') {
    return (
      <EmptyState
        icon={<Boxes className="h-5 w-5" aria-hidden="true" />}
        title={t('groups.noResults.title')}
        description={t('groups.noResults.body')}
      />
    );
  }

  return <GroupTable groups={groups} variant={variant} />;
}
