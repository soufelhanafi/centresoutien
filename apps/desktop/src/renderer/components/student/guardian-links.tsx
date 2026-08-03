import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import { UserPlus, Users } from 'lucide-react';
import type { ParentView } from '../../lib/parents/parent-view';
import type { StudentView } from '../../lib/students/student-view';
import { useGuardianLinks } from '../../hooks/student/use-guardian-links';
import { EntityCombobox } from '../common/entity-combobox';
import { CreateParentSheet } from '../parent/create-parent-sheet';
import { GuardianLinkRow } from './guardian-link-row';

/** Student → guardians panel: link an existing parent, create one inline, or unlink. */
export function GuardianLinks({ student }: { student: StudentView }) {
  const { t } = useTranslation();
  const { parentsQuery, linked, linkable, link, unlink, pending } = useGuardianLinks(student);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <section className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {t('students.guardians.title')}
          {parentsQuery.isSuccess && (
            <span className="ms-2 text-xs font-normal text-muted-foreground">
              {t('students.guardians.count', { count: linked.length })}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <EntityCombobox<ParentView>
            items={linkable}
            getKey={(parent) => parent.id}
            getPrimary={(parent) => parent.name}
            getSecondary={(parent) => parent.phone}
            onSelect={(parent) => link(parent.id)}
            labels={{
              trigger: t('students.guardians.add'),
              search: t('students.guardians.searchPlaceholder'),
              empty: t('students.guardians.noMatches'),
            }}
            disabled={pending}
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {t('students.guardians.createNew')}
          </Button>
        </div>
      </div>

      {parentsQuery.isPending && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {parentsQuery.isError && (
        <ErrorState
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          title={t('students.guardians.loadError')}
        />
      )}

      {parentsQuery.isSuccess && linked.length === 0 && (
        <EmptyState
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          title={t('students.guardians.empty.title')}
          description={t('students.guardians.empty.body')}
        />
      )}

      {parentsQuery.isSuccess && linked.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {linked.map((parent) => (
            <GuardianLinkRow
              key={parent.id}
              parent={parent}
              onUnlink={() => unlink(parent.id)}
              disabled={pending}
            />
          ))}
        </ul>
      )}

      <CreateParentSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(parent) => link(parent.id)}
      />
    </section>
  );
}
