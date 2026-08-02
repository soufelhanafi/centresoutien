import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { TeacherPayrollRuleInput } from '@centresoutien/domain';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useCreateTeacherPayrollRule } from '../../hooks/teacher-payroll-rule/use-create-teacher-payroll-rule';
import { useCloseTeacherPayrollRule } from '../../hooks/teacher-payroll-rule/use-close-teacher-payroll-rule';
import { mapTeacherPayrollRuleWriteError } from '../../lib/teacher-payroll-rules/teacher-payroll-rule-write-error';
import type { TeacherPayrollRuleView } from '../../lib/teacher-payroll-rules/teacher-payroll-rule-view';
import { currentMonth, nextMonth, previousMonth } from '../../lib/teacher-payroll-rules/month';
import { TeacherPayrollRuleForm } from './teacher-payroll-rule-form';

type SetTeacherPayrollRuleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacherId: string;
  /** The teacher's current live rule, or `null` to define the first one. */
  activeRule: TeacherPayrollRuleView | null;
};

/**
 * Set-or-replace flow: a teacher with no live rule gets a plain create; a
 * teacher with one gets the close-and-reopen combo (CLAUDE.md §6) — close the
 * current rule the month before the replacement's effective month, then
 * create the replacement — both mutations run before the dialog reports
 * success, so a failed create never leaves an orphaned close.
 */
export function SetTeacherPayrollRuleDialog({
  open,
  onOpenChange,
  teacherId,
  activeRule,
}: SetTeacherPayrollRuleDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const create = useCreateTeacherPayrollRule();
  const close = useCloseTeacherPayrollRule();
  const fixedEnabled = useFeature('payroll.teacher.fixed');

  // With no active rule, default to whichever kind flag the plan actually
  // grants — both ship together on every plan today, but the field stays
  // correct if that ever splits (mirrors the kind field's own per-flag gate).
  const defaultKind = activeRule?.kind ?? (fixedEnabled ? 'fixed-monthly' : 'percentage-of-monthly-fees');

  const defaultValues: TeacherPayrollRuleInput =
    defaultKind === 'percentage-of-monthly-fees'
      ? {
          kind: 'percentage-of-monthly-fees',
          teacherId,
          percent: activeRule?.kind === 'percentage-of-monthly-fees' ? activeRule.percent : Number.NaN,
          startMonth: currentMonth(),
          endMonth: null,
        }
      : {
          kind: 'fixed-monthly',
          teacherId,
          amountMad: activeRule?.kind === 'fixed-monthly' ? activeRule.amountMad : Number.NaN,
          startMonth: currentMonth(),
          endMonth: null,
        };

  const handleSubmit = async (values: TeacherPayrollRuleInput) => {
    try {
      if (activeRule) {
        await close.mutateAsync({ ruleId: activeRule.id, endMonth: previousMonth(values.startMonth) });
      }
      await create.mutateAsync(values);
      toast.success(
        t(activeRule ? 'teachers.detail.payroll.form.changeSuccess' : 'teachers.detail.payroll.form.createSuccess'),
      );
      onOpenChange(false);
    } catch (error) {
      const code = mapTeacherPayrollRuleWriteError(error);
      toast.error(t(code ? `errors.${code}` : 'teachers.detail.payroll.form.error'));
    }
  };

  const saving = create.isPending || close.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('teachers.detail.payroll.form.cancel')}>
        <DialogHeader>
          <DialogTitle>
            {t(activeRule ? 'teachers.detail.payroll.form.changeTitle' : 'teachers.detail.payroll.form.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {t(
              activeRule
                ? 'teachers.detail.payroll.form.changeDescription'
                : 'teachers.detail.payroll.form.createDescription',
            )}
          </DialogDescription>
        </DialogHeader>
        <TeacherPayrollRuleForm
          formId={formId}
          defaultValues={defaultValues}
          minStartMonth={activeRule ? nextMonth(activeRule.startMonth) : undefined}
          onSubmit={handleSubmit}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('teachers.detail.payroll.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={saving}>
            {saving
              ? t('teachers.detail.payroll.form.saving')
              : t(activeRule ? 'teachers.detail.payroll.form.save' : 'teachers.detail.payroll.form.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
