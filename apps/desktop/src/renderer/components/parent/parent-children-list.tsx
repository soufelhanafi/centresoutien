import { useTranslation } from 'react-i18next';
import { GraduationCap, Plus } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import { useParentChildren } from '../../hooks/parent/use-parent-children';
import { useChildLinks } from '../../hooks/parent/use-child-links';
import { localizedName } from '../../lib/students/localized-name';
import { EntityCombobox } from '../common/entity-combobox';
import { ParentChildRow } from './parent-child-row';

/** The guardian's linked students: link an existing one, create inline, or unlink. */
export function ParentChildrenList({
  parentId,
  enabled,
  onAddChild,
}: {
  parentId: string;
  enabled: boolean;
  onAddChild: () => void;
}) {
  const { t, i18n } = useTranslation();
  const query = useParentChildren(parentId, enabled);
  const children = query.data ?? [];
  const { linkable, link, unlink, pending } = useChildLinks(parentId, children);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {t('parents.detail.children.title')}
          {query.isSuccess && (
            <span className="ms-2 text-xs font-normal text-muted-foreground">
              {t('parents.detail.children.count', { count: children.length })}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <EntityCombobox<StudentView>
            items={linkable}
            getKey={(student) => student.id}
            getPrimary={(student) => localizedName(student, i18n.language)}
            getSecondary={(student) => (i18n.language === 'ar' ? student.name.fr : student.name.ar)}
            onSelect={(student) => link(student)}
            labels={{
              trigger: t('parents.detail.children.linkExisting'),
              search: t('parents.detail.children.searchPlaceholder'),
              empty: t('parents.detail.children.noMatches'),
            }}
            disabled={pending}
          />
          <Button type="button" variant="ghost" size="sm" onClick={onAddChild}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('parents.detail.children.add')}
          </Button>
        </div>
      </div>

      {query.isPending && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      )}

      {query.isError && (
        <ErrorState
          icon={<GraduationCap className="h-5 w-5" aria-hidden="true" />}
          title={t('parents.detail.children.loadError')}
        />
      )}

      {query.isSuccess && children.length === 0 && (
        <EmptyState
          icon={<GraduationCap className="h-5 w-5" aria-hidden="true" />}
          title={t('parents.detail.children.empty.title')}
          description={t('parents.detail.children.empty.body')}
        />
      )}

      {query.isSuccess && children.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {children.map((student) => (
            <ParentChildRow
              key={student.id}
              student={student}
              onUnlink={() => unlink(student)}
              disabled={pending}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
