import { useTranslation } from 'react-i18next';
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@centresoutien/ui';
import { formatMoneyMad } from '../../lib/format';
import type { FormulaView } from '../../lib/formulas/formula-view';
import { localizedFormulaName } from '../../lib/formulas/localized-name';

/** The reopen half of the wizard: which (active) formula, starting which month. */
export function SubscriptionFormulaFields({
  formulas,
  formulaId,
  onFormulaIdChange,
  startMonth,
  onStartMonthChange,
}: {
  formulas: readonly FormulaView[];
  formulaId: string;
  onFormulaIdChange: (value: string) => void;
  startMonth: string;
  onStartMonthChange: (value: string) => void;
}) {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>{t('students.subscription.wizard.formulaLabel')}</Label>
        <Select value={formulaId} onValueChange={onFormulaIdChange} disabled={formulas.length === 0}>
          <SelectTrigger>
            <SelectValue placeholder={t('students.subscription.wizard.formulaPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {formulas.map((formula) => (
              <SelectItem key={formula.id} value={formula.id}>
                {`${localizedFormulaName(formula.name, i18n.language)} — ${formatMoneyMad(formula.priceMad, i18n.language)}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {formulas.length === 0 && (
          <p className="text-xs text-muted-foreground">{t('students.subscription.wizard.noFormulas')}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subscription-start-month">{t('students.subscription.wizard.startMonthLabel')}</Label>
        <Input
          id="subscription-start-month"
          type="month"
          dir="ltr"
          value={startMonth}
          onChange={(event) => onStartMonthChange(event.target.value)}
        />
      </div>
    </div>
  );
}
