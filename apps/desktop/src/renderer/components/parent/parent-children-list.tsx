import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { GraduationCap, Plus } from 'lucide-react';
import { Button, EmptyState, Skeleton, BilingualText } from '@centresoutien/ui';
import { useParentChildren } from '../../hooks/parent/use-parent-children';

/** The guardian's linked students, with a quick "add student" action. */
export function ParentChildrenList({
  parentId,
  enabled,
  onAddChild,
}: {
  parentId: string;
  enabled: boolean;
  onAddChild: () => void;
}) {
  const { t } = useTranslation();
  const query = useParentChildren(parentId, enabled);
  const children = query.data ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">
          {t('parents.detail.children.title')}
          {query.isSuccess && (
            <span className="ms-2 text-xs font-normal text-muted-foreground">
              {t('parents.detail.children.count', { count: children.length })}
            </span>
          )}
        </h3>
        <Button variant="outline" size="sm" onClick={onAddChild}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('parents.detail.children.add')}
        </Button>
      </div>

      {query.isPending && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      )}

      {query.isError && (
        <EmptyState
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
            <li key={student.id}>
              <Link
                to="/students/$studentId"
                params={{ studentId: student.id }}
                className="flex flex-col gap-0.5 p-3 hover:bg-muted/50"
              >
                <span className="text-sm font-medium text-foreground">{student.name.fr}</span>
                <BilingualText
                  value={student.name.ar}
                  script="arabic"
                  className="text-xs text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
