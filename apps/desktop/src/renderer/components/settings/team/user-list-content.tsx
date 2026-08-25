import { useTranslation } from 'react-i18next';
import { UserPlus, Users } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import type { UserView } from '../../../lib/users/user-view';
import { UserTable } from './user-table';

export type UserListStatus = 'loading' | 'error' | 'empty' | 'ready';

type UserListContentProps = {
  status: UserListStatus;
  users: readonly UserView[];
  onRetry: () => void;
  onInvite: () => void;
  onReissue: (user: UserView) => void;
  reissuingId: string | null;
};

/** Renders the correct state for the team roster: loading, error, empty, or table. */
export function UserListContent({
  status,
  users,
  onRetry,
  onInvite,
  onReissue,
  reissuingId,
}: UserListContentProps) {
  const { t } = useTranslation();

  if (status === 'loading') {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-4" aria-busy="true">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <ErrorState
        icon={<Users className="h-5 w-5" aria-hidden="true" />}
        title={t('team.loadError.title')}
        description={t('team.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('team.loadError.retry')}
          </Button>
        }
      />
    );
  }

  if (status === 'empty') {
    return (
      <EmptyState
        icon={<UserPlus className="h-5 w-5" aria-hidden="true" />}
        title={t('team.empty.title')}
        description={t('team.empty.body')}
        action={
          <Button size="sm" onClick={onInvite}>
            {t('team.empty.cta')}
          </Button>
        }
      />
    );
  }

  return <UserTable users={users} onReissue={onReissue} reissuingId={reissuingId} />;
}
