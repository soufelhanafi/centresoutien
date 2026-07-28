import { useTranslation } from 'react-i18next';
import { PLANS } from '@centresoutien/domain';
import type { PlanId } from '@centresoutien/domain';
import { Button } from '@centresoutien/ui';
import { usePlanStore } from '../stores/plan-store';

const PLAN_IDS = Object.keys(PLANS) as PlanId[];

/** Dev-only affordance: switch the active plan and watch gated UI toggle live. */
export function PlanSwitcher() {
  const { t } = useTranslation();
  const planId = usePlanStore((state) => state.planId);
  const setPlan = usePlanStore((state) => state.setPlan);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{t('plan.devSwitcher')} :</span>
      {PLAN_IDS.map((id) => (
        <Button
          key={id}
          size="sm"
          variant={id === planId ? 'default' : 'outline'}
          onClick={() => setPlan(id)}
        >
          {id}
        </Button>
      ))}
    </div>
  );
}
