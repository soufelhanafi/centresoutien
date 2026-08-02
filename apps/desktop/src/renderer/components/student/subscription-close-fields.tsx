import { useTranslation } from 'react-i18next';
import { Input, Label } from '@centresoutien/ui';
import type { FormulaView } from '../../lib/formulas/formula-view';
import type { SubjectView } from '../../lib/subjects/subject-view';
import { resolveSubscriptionLabel } from '../../lib/subscriptions/subscription-label';
import type { SubscriptionView } from '../../lib/subscriptions/subscription-view';

/** The close half of the wizard: the current formula being ended + its end month. */
export function SubscriptionCloseFields({
  current,
  formulas,
  subjects,
  endMonth,
  onEndMonthChange,
}: {
  current: SubscriptionView;
  formulas: readonly FormulaView[];
  subjects: readonly SubjectView[];
  endMonth: string;
  onEndMonthChange: (value: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const label = resolveSubscriptionLabel(current, formulas, subjects, i18n.language);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-col gap-1">
        <Label>{t('students.subscription.wizard.currentFormulaLabel')}</Label>
        <p className="text-sm font-medium text-foreground">{label.text}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subscription-end-month">{t('students.subscription.wizard.endMonthLabel')}</Label>
        <Input
          id="subscription-end-month"
          type="month"
          dir="ltr"
          value={endMonth}
          onChange={(event) => onEndMonthChange(event.target.value)}
        />
      </div>
    </div>
  );
}
