import { useTranslation } from 'react-i18next';
import { UserRound, Users } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import type { ParentView } from '../../lib/parents/parent-view';
import { ParentTable } from './parent-table';

export type ParentListStatus = 'loading' | 'error' | 'empty' | 'noResults' | 'ready';

type ParentListContentProps = {
  status: ParentListStatus;
  parents: readonly ParentView[];
  onRetry: () => void;
  onCreate: () => void;
  onOpenDetail: (parent: ParentView) => void;
};

/** Renders the correct state for the list: loading, error, empty, no-results, or table. */
export function ParentListContent({
  status,
  parents,
  onRetry,
  onCreate,
  onOpenDetail,
}: ParentListContentProps) {
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
      <ErrorState
        icon={<Users className="h-5 w-5" aria-hidden="true" />}
        title={t('parents.loadError.title')}
        description={t('parents.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('parents.loadError.retry')}
          </Button>
        }
      />
    );
  }

  if (status === 'empty') {
    return (
      <EmptyState
        icon={<UserRound className="h-5 w-5" aria-hidden="true" />}
        title={t('parents.empty.title')}
        description={t('parents.empty.body')}
        action={
          <Button size="sm" onClick={onCreate}>
            {t('parents.empty.cta')}
          </Button>
        }
      />
    );
  }

  if (status === 'noResults') {
    return (
      <EmptyState
        icon={<Users className="h-5 w-5" aria-hidden="true" />}
        title={t('parents.noResults.title')}
        description={t('parents.noResults.body')}
      />
    );
  }

  return <ParentTable parents={parents} onOpenDetail={onOpenDetail} />;
}
