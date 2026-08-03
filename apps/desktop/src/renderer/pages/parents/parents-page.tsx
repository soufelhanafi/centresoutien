import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { getRouteApi } from '@tanstack/react-router';
import { Button } from '@centresoutien/ui';
import { useParents } from '../../hooks/parent/use-parents';
import type { ParentView } from '../../lib/parents/parent-view';
import { ParentListToolbar } from '../../components/parent/parent-list-toolbar';
import {
  ParentListContent,
  type ParentListStatus,
} from '../../components/parent/parent-list-content';
import { CreateParentSheet } from '../../components/parent/create-parent-sheet';
import { ParentDetailSheet } from '../../components/parent/parent-detail-sheet';

const parentsRouteApi = getRouteApi('/parents');

/** Parents module: searchable list with create / edit / archive + a detail sheet. */
export function ParentsPage() {
  const { t } = useTranslation();
  const navigate = parentsRouteApi.useNavigate();
  const { openParentId } = parentsRouteApi.useSearch();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailParent, setDetailParent] = useState<ParentView | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const query = useParents(search);
  const parents = useMemo(() => query.data ?? [], [query.data]);
  const isFiltered = search.trim() !== '';

  // Consumes the command palette's deep link (SOU-43): open the matching
  // parent's detail sheet once, then strip the param so it doesn't re-fire.
  useEffect(() => {
    if (!openParentId) return;
    const match = parents.find((parent) => parent.id === openParentId);
    if (!match) return;
    setDetailParent(match);
    setDetailOpen(true);
    void navigate({ search: {}, replace: true });
  }, [openParentId, parents, navigate]);

  const status: ParentListStatus = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : parents.length > 0
        ? 'ready'
        : isFiltered
          ? 'noResults'
          : 'empty';

  const openDetail = (parent: ParentView) => {
    setDetailParent(parent);
    setDetailOpen(true);
  };

  return (
    <section aria-labelledby="parents-title" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 id="parents-title" className="text-xl font-semibold text-foreground">
            {t('parents.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('parents.subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('parents.new')}
        </Button>
      </header>

      <ParentListToolbar search={search} onSearchChange={setSearch} />

      <ParentListContent
        status={status}
        parents={parents}
        onRetry={() => void query.refetch()}
        onCreate={() => setCreateOpen(true)}
        onOpenDetail={openDetail}
      />

      <CreateParentSheet open={createOpen} onOpenChange={setCreateOpen} />

      {detailParent && (
        <ParentDetailSheet
          parent={detailParent}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          onArchived={() => setDetailOpen(false)}
        />
      )}
    </section>
  );
}
