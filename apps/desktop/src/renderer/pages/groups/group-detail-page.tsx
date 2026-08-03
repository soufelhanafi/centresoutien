import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Boxes } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import { useGroup } from '../../hooks/group/use-group';
import { GroupDetailHeader } from '../../components/group/group-detail-header';
import { GroupRosterPanel } from '../../components/group/group-roster-panel';

/** Group detail: header actions + roster, loaded by route param. */
export function GroupDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { groupId } = useParams({ from: '/groups/$groupId' });
  const query = useGroup(groupId);

  if (query.isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4" aria-busy="true">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError || query.data === null) {
    return (
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Link
          to="/groups"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
          {t('groups.detail.back')}
        </Link>
        {query.isError ? (
          <ErrorState
            icon={<Boxes className="h-5 w-5" aria-hidden="true" />}
            title={t('groups.loadError.title')}
            description={t('groups.detail.loadError')}
            action={
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                {t('groups.loadError.retry')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Boxes className="h-5 w-5" aria-hidden="true" />}
            title={t('groups.detail.notFoundTitle')}
            description={t('groups.detail.notFoundBody')}
            action={
              <Button variant="outline" size="sm" onClick={() => navigate({ to: '/groups' })}>
                {t('groups.detail.back')}
              </Button>
            }
          />
        )}
      </section>
    );
  }

  const group = query.data;

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-2">
      <GroupDetailHeader group={group} onArchived={() => navigate({ to: '/groups' })} />
      <GroupRosterPanel group={group} />
    </section>
  );
}
