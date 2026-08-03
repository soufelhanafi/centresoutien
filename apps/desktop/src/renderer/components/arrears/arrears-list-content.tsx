import { useTranslation } from 'react-i18next';
import { CircleCheck, CircleAlert } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import type { ArrearsParentGroupView } from '../../lib/arrears/arrears-view';
import { ArrearsParentList } from './arrears-parent-list';

export type ArrearsListStatus = 'loading' | 'error' | 'empty' | 'noResults' | 'ready';

type ArrearsListContentProps = {
  status: ArrearsListStatus;
  parents: readonly ArrearsParentGroupView[];
  onRetry: () => void;
};

/** Renders the correct state for the follow-up list: loading, error, empty (good news), no-results, or the parent cards. */
export function ArrearsListContent({ status, parents, onRetry }: ArrearsListContentProps) {
  const { t } = useTranslation();

  if (status === 'loading') {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-4" aria-busy="true">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <ErrorState
        icon={<CircleAlert className="h-5 w-5" aria-hidden="true" />}
        title={t('arrears.loadError.title')}
        description={t('arrears.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('arrears.loadError.retry')}
          </Button>
        }
      />
    );
  }

  if (status === 'empty') {
    return (
      <EmptyState
        icon={<CircleCheck className="h-5 w-5" aria-hidden="true" />}
        title={t('arrears.empty.title')}
        description={t('arrears.empty.body')}
      />
    );
  }

  if (status === 'noResults') {
    return (
      <EmptyState
        icon={<CircleAlert className="h-5 w-5" aria-hidden="true" />}
        title={t('arrears.noResults.title')}
        description={t('arrears.noResults.body')}
      />
    );
  }

  return <ArrearsParentList parents={parents} />;
}
