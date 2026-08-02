import type { Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { TEACHER_PAYROLL_RULE_KINDS } from '@centresoutien/domain';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import { useFeature } from '../../hooks/use-feature';
import type { TeacherPayrollRuleFormValues } from './teacher-payroll-rule-form';

/** Maps a rule kind to its i18n label suffix (`fixed-monthly` → `fixedMonthly`). */
const kindLabelKey = (kind: string) => (kind === 'fixed-monthly' ? 'fixedMonthly' : 'percentageOfMonthlyFees');

/**
 * The fixed-monthly / percentage-of-monthly-fees selector. Options are
 * restricted to whichever kind flags the active plan includes
 * (`payroll.teacher.fixed` / `payroll.teacher.percentage`) — the caller
 * already gates the whole tab on the base `payroll.teacher` flag, this is
 * defense-in-depth mirroring the domain's own per-kind gate on
 * `CreateTeacherPayrollRule`.
 */
export function TeacherPayrollRuleKindField({ control }: { control: Control<TeacherPayrollRuleFormValues> }) {
  const { t } = useTranslation();
  const fixedEnabled = useFeature('payroll.teacher.fixed');
  const percentageEnabled = useFeature('payroll.teacher.percentage');
  const kinds = TEACHER_PAYROLL_RULE_KINDS.filter((kind) =>
    kind === 'fixed-monthly' ? fixedEnabled : percentageEnabled,
  );

  return (
    <FormField
      control={control}
      name="kind"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t('teachers.detail.payroll.form.kind')}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={t('teachers.detail.payroll.form.kind')} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {kinds.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {t(`teachers.detail.payroll.kind.${kindLabelKey(kind)}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldMessage />
        </FormItem>
      )}
    />
  );
}
