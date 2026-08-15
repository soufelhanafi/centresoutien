import { useTranslation } from 'react-i18next';
import { GraduationCap } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import { useNiveauxWithUsage } from '../../hooks/niveau/use-niveaux-with-usage';
import { groupNiveauxByCategory } from '../../lib/niveaux/grouping';
import { NiveauCategorySection } from './niveau-category-section';

/**
 * Connects the manage-niveaux screen to the `listWithUsage` query, groups the
 * rows by category (PRIMAIRE → COLLÈGE → LYCÉE), and derives the display state.
 * Each category renders its own {@link NiveauCategorySection}.
 */
export function NiveauListPanel({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  const query = useNiveauxWithUsage();
  const groups = groupNiveauxByCategory(query.data ?? []);
  const total = groups.reduce((sum, group) => sum + group.niveaux.length, 0);

  if (query.isPending) {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-4" aria-busy="true">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        icon={<GraduationCap className="h-5 w-5" aria-hidden="true" />}
        title={t('niveaux.loadError.title')}
        description={t('niveaux.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('niveaux.loadError.retry')}
          </Button>
        }
      />
    );
  }

  if (total === 0) {
    return (
      <EmptyState
        icon={<GraduationCap className="h-5 w-5" aria-hidden="true" />}
        title={t('niveaux.empty.title')}
        description={t('niveaux.empty.body')}
        action={
          <Button size="sm" onClick={onCreate}>
            {t('niveaux.empty.cta')}
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <NiveauCategorySection key={group.category} group={group} />
      ))}
    </div>
  );
}
