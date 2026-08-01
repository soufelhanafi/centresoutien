import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PlanBadge } from '@centresoutien/ui';
import { usePlanStore } from '../../stores/plan-store';
import { FEATURE_LABEL_KEYS } from '../../lib/settings/feature-labels';

type LimitRow = { labelKey: string; value: number | 'unlimited' };

/**
 * Read-only Plan-info section of the Settings page (SOU-31): the active
 * plan's id, limits, and feature set. `PlanSwitcher` (dev-only, sidebar)
 * stays where it is — this tab only displays, never changes, the plan.
 */
export function PlanSettings() {
  const { t, i18n } = useTranslation();
  const planId = usePlanStore((state) => state.planId);
  const plan = usePlanStore((state) => state.plan);
  const numberFormat = new Intl.NumberFormat(i18n.language);

  const limitRows: readonly LimitRow[] = [
    { labelKey: 'settings.plan.maxStudents', value: plan.limits.maxStudents },
    { labelKey: 'settings.plan.maxTeachers', value: plan.limits.maxTeachers },
    { labelKey: 'settings.plan.maxRooms', value: plan.limits.maxRooms },
  ];

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>{t('settings.plan.title')}</CardTitle>
            <CardDescription>{t('settings.plan.subtitle')}</CardDescription>
          </div>
          <PlanBadge tier={planId} />
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">{t('settings.plan.limitsTitle')}</h3>
          <dl className="grid grid-cols-3 gap-3">
            {limitRows.map((row) => (
              <div key={row.labelKey} className="flex flex-col gap-1 rounded-lg border border-border p-3">
                <dt className="text-xs text-muted-foreground">{t(row.labelKey)}</dt>
                <dd className="text-lg font-semibold text-foreground">
                  {row.value === 'unlimited' ? t('settings.plan.unlimited') : numberFormat.format(row.value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">{t('settings.plan.featuresTitle')}</h3>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {Array.from(plan.features).map((flag) => (
              <li key={flag} className="flex items-center gap-2 text-sm text-foreground">
                <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {t(`settings.plan.features.${FEATURE_LABEL_KEYS[flag]}`)}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
