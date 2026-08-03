import { useTranslation } from 'react-i18next';
import { Label } from '@centresoutien/ui';
import type { FormulaView } from '../../lib/formulas/formula-view';
import type { SubjectView } from '../../lib/subjects/subject-view';
import { resolveSubscriptionLabel } from '../../lib/subscriptions/subscription-label';
import type { SubscriptionView } from '../../lib/subscriptions/subscription-view';
import { previousMonth } from '../../lib/subscriptions/subscription-month';

/** Shows the current formula being replaced and the derived close month (always the month before startMonth). */
export function SubscriptionCloseFields({
  current,
  formulas,
  subjects,
  startMonth,
}: {
  current: SubscriptionView;
  formulas: readonly FormulaView[];
  subjects: readonly SubjectView[];
  startMonth: string;
}) {
  const { t, i18n } = useTranslation();
  const label = resolveSubscriptionLabel(current, formulas, subjects, i18n.language);
  const closeMonth = previousMonth(startMonth);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-col gap-1">
        <Label>{t('students.subscription.wizard.currentFormulaLabel')}</Label>
        <p className="text-sm font-medium text-foreground">{label.text}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t('students.subscription.wizard.endMonthLabel')}</Label>
        <p className="text-sm text-muted-foreground">{closeMonth}</p>
      </div>
    </div>
  );
}
