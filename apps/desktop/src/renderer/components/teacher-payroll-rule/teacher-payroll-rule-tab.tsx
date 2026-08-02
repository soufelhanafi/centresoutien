import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isPayrollRuleActiveInMonth } from '@centresoutien/domain';
import { Button, EmptyState, LockOverlay, Skeleton } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useTeacherPayrollRules } from '../../hooks/teacher-payroll-rule/use-teacher-payroll-rules';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import { currentMonth } from '../../lib/teacher-payroll-rules/month';
import { TeacherPayrollRuleActiveCard } from './teacher-payroll-rule-active-card';
import { TeacherPayrollRuleHistoryTable } from './teacher-payroll-rule-history-table';
import { SetTeacherPayrollRuleDialog } from './set-teacher-payroll-rule-dialog';

/**
 * The teacher detail Rule tab (SOU-72): Active section + History, split
 * client-side via `isPayrollRuleActiveInMonth` from one `teacherPayrollRule.list`
 * read — mirrors `FormulaListPanel`'s single-query, client-split pattern.
 * Locked with the standard overlay treatment on plans without `payroll.teacher`.
 */
export function TeacherPayrollRuleTab({ teacher }: { teacher: TeacherView }) {
  const { t } = useTranslation();
  const hasPayroll = useFeature('payroll.teacher');
  const [dialogOpen, setDialogOpen] = useState(false);
  const query = useTeacherPayrollRules(teacher.id, { enabled: hasPayroll });

  if (!hasPayroll) {
    return (
      <div className="mt-4">
        <LockOverlay
          title={t('teachers.detail.tabs.payroll')}
          description={t('plan.locked')}
          ctaLabel={t('plan.viewPlans')}
          className="w-full"
        >
          <div className="p-8 text-sm text-muted-foreground">{t('teachers.detail.payroll.lockedBody')}</div>
        </LockOverlay>
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className="mt-4 space-y-2" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        className="mt-4"
        title={t('teachers.detail.payroll.loadError.title')}
        description={t('teachers.detail.payroll.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('teachers.detail.payroll.loadError.retry')}
          </Button>
        }
      />
    );
  }

  const month = currentMonth();
  const activeRule = query.data.find((rule) => isPayrollRuleActiveInMonth(rule, month)) ?? null;
  const history = query.data.filter((rule) => rule.id !== activeRule?.id);

  return (
    <div className="mt-4 flex flex-col gap-6">
      <TeacherPayrollRuleActiveCard rule={activeRule} onChange={() => setDialogOpen(true)} />
      <section aria-labelledby="teacher-payroll-history-title" className="space-y-2">
        <h2 id="teacher-payroll-history-title" className="text-sm font-semibold text-foreground">
          {t('teachers.detail.payroll.history.title')}
        </h2>
        <TeacherPayrollRuleHistoryTable rules={history} />
      </section>
      <SetTeacherPayrollRuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        teacherId={teacher.id}
        activeRule={activeRule}
      />
    </div>
  );
}
