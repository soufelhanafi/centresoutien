import { useTranslation } from 'react-i18next';
import { GraduationCap } from 'lucide-react';
import { EmptyState } from '@centresoutien/ui';
import type { NiveauCategoryGroup } from '../../lib/niveaux/grouping';
import { niveauCategoryLabelKey } from './niveau-form';
import { NiveauTable } from './niveau-table';

/**
 * One category's section on the manage-niveaux screen: a heading (PRIMAIRE /
 * COLLÈGE / LYCÉE) over its table, or a compact empty state when the category has
 * no levels yet.
 */
export function NiveauCategorySection({ group }: { group: NiveauCategoryGroup }) {
  const { t } = useTranslation();

  return (
    <section aria-labelledby={`niveau-category-${group.category}`} className="flex flex-col gap-2">
      <h2 id={`niveau-category-${group.category}`} className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t(niveauCategoryLabelKey(group.category))}
      </h2>
      {group.niveaux.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-5 w-5" aria-hidden="true" />}
          title={t('niveaux.category.emptyTitle', { category: t(niveauCategoryLabelKey(group.category)) })}
          description={t('niveaux.category.emptyBody')}
          className="rounded-xl border border-dashed"
        />
      ) : (
        <NiveauTable niveaux={group.niveaux} />
      )}
    </section>
  );
}
