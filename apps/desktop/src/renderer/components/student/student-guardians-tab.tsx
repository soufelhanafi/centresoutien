import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { Button, EmptyState, LockOverlay } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';

/**
 * Guardians shell. Managing guardian links belongs to the Parent module
 * (`core.parents`, Pro — SOU-40), which isn't built yet. On plans without the
 * feature we show the standard lock treatment; on Pro, an empty state pending
 * the Parent entity. Gating is by feature flag, never by plan name.
 */
export function StudentGuardiansTab() {
  const { t } = useTranslation();
  const canManage = useFeature('core.parents');
  const icon = <Users className="h-5 w-5" aria-hidden="true" />;

  if (!canManage) {
    return (
      <LockOverlay
        title={t('students.guardians.locked.title')}
        description={t('students.guardians.locked.body')}
        ctaLabel={t('plan.viewPlans')}
        className="mt-4"
      >
        <div className="p-8">
          <EmptyState icon={icon} title={t('students.guardians.empty.title')} />
        </div>
      </LockOverlay>
    );
  }

  return (
    <EmptyState
      className="mt-4"
      icon={icon}
      title={t('students.guardians.empty.title')}
      description={t('students.guardians.comingSoon')}
      action={
        <Button variant="outline" size="sm" disabled>
          {t('students.guardians.add')}
        </Button>
      }
    />
  );
}
