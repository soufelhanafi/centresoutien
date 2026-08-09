import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, LockOverlay, Skeleton } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useUpgradeCta } from '../../hooks/use-upgrade-prompt';
import { useTeacherPayrollRules } from '../../hooks/teacher-payroll-rule/use-teacher-payroll-rules';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import { TeacherPayrollRuleActiveCard } from './teacher-payroll-rule-active-card';
import { TeacherPayrollRuleHistoryTable } from './teacher-payroll-rule-history-table';
import { SetTeacherPayrollRuleDialog } from './set-teacher-payroll-rule-dialog';

/**
 * The teacher detail Rule tab (SOU-72): Active section + History, split
 * client-side from one `teacherPayrollRule.list` read — mirrors
 * `FormulaListPanel`'s single-query, client-split pattern. Locked with the
 * standard overlay treatment on plans without `payroll.teacher`.
 *
 * "Active" is the rule with `endMonth === null` — the open-ended one, whether
 * its `startMonth` is already past or still upcoming. The at-most-one-live
 * overlap invariant (`payrollRuleRangesOverlap`) guarantees at most one
 * open-ended rule exists at a time: creating a replacement always closes the
 * prior one first (`SetTeacherPayrollRuleDialog`), so a currently-active rule
 * and a not-yet-started replacement can never coexist as two "open" rows.
 * Checking against the calendar month instead (`isPayrollRuleActiveInMonth`)
 * would misfile a future-dated replacement into History, since it isn't
 * active *this* month yet.
 */
export function TeacherPayrollRuleTab({ teacher }: { teacher: TeacherView }) {
  const { t } = useTranslation();
  const hasPayroll = useFeature('payroll.teacher');
  const upgradeCta = useUpgradeCta('payroll.teacher');
  const [dialogOpen, setDialogOpen] = useState(false);
  const query = useTeacherPayrollRules(teacher.id, { enabled: hasPayroll });

  if (!hasPayroll) {
    return (
      <div className="mt-4">
        <LockOverlay
          title={t('teachers.detail.tabs.payroll')}
          description={t('plan.locked')}
          ctaLabel={upgradeCta.ctaLabel}
          onCta={upgradeCta.onCta}
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

  const activeRule = query.data.find((rule) => rule.endMonth === null) ?? null;
  const history = query.data.filter((rule) => rule.endMonth !== null);

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
