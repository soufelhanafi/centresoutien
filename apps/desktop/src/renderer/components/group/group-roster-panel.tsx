import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, Users } from 'lucide-react';
import { Button, EmptyState, Numeric, Skeleton, toast } from '@centresoutien/ui';
import type { GroupRow } from '../../lib/groups/group-view';
import { useGroupRoster } from '../../hooks/group/use-group-roster';
import { useRemoveStudent } from '../../hooks/group/use-remove-student';
import { GroupRosterRow } from './group-roster-row';
import { AddStudentDialog } from './add-student-dialog';

/** Group → roster panel: enrolled students, quick add-student modal, remove. */
export function GroupRosterPanel({ group }: { group: GroupRow }) {
  const { t } = useTranslation();
  const rosterQuery = useGroupRoster(group.id);
  const remove = useRemoveStudent();
  const [addOpen, setAddOpen] = useState(false);
  const roster = rosterQuery.data ?? [];
  const full = group.capacity > 0 && group.enrolledCount >= group.capacity;

  const handleRemove = async (enrollmentId: string) => {
    try {
      await remove.mutateAsync(enrollmentId);
      toast.success(t('groups.roster.removeSuccess'));
    } catch {
      toast.error(t('groups.roster.removeError'));
    }
  };

  return (
    <section className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {t('groups.roster.title')}
          {rosterQuery.isSuccess && (
            <Numeric className="ms-2 text-xs font-normal text-muted-foreground">
              {t('groups.roster.count', { count: roster.length })}
            </Numeric>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {full && <span className="text-xs text-muted-foreground">{t('groups.roster.full')}</span>}
          <Button size="sm" disabled={full} onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {t('groups.roster.add')}
          </Button>
        </div>
      </div>

      {rosterQuery.isPending && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {rosterQuery.isError && (
        <EmptyState
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          title={t('groups.roster.loadError')}
        />
      )}

      {rosterQuery.isSuccess && roster.length === 0 && (
        <EmptyState
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          title={t('groups.roster.empty.title')}
          description={t('groups.roster.empty.body')}
        />
      )}

      {rosterQuery.isSuccess && roster.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {roster.map((entry) => (
            <GroupRosterRow
              key={entry.enrollmentId}
              entry={entry}
              onRemove={() => handleRemove(entry.enrollmentId)}
              disabled={remove.isPending}
            />
          ))}
        </ul>
      )}

      <AddStudentDialog groupId={group.id} open={addOpen} onOpenChange={setAddOpen} />
    </section>
  );
}
