import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Standard "feature locked" pill, used as a FeatureGate fallback. */
export function PlanLock() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
      <Lock className="h-3 w-3" aria-hidden="true" />
      {t('plan.locked')}
    </span>
  );
}
