import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LockOverlay } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useUpgradeCta } from '../../hooks/use-upgrade-prompt';
import { useTeachers } from '../../hooks/teacher/use-teachers';
import { useSubjects } from '../../hooks/subject/use-subjects';
import { usePayrollPayouts } from '../../hooks/payroll/use-payroll-payouts';
import { useAttributionBreakdown } from '../../hooks/payroll/use-attribution-breakdown';
import { usePayrollProjection } from '../../hooks/payroll/use-payroll-projection';
import { groupBreakdownByTeacher } from '../../lib/payroll/attribution-grouping';
import { currentMonth } from '../../lib/payroll/month';
import { PayrollToolbar } from '../../components/payroll/payroll-toolbar';
import { PayrollProjectionSection } from '../../components/payroll/payroll-projection-section';
import { PayrollListContent, type PayrollListStatus } from '../../components/payroll/payroll-list-content';

/** Payroll dashboard (SOU-76): month-scoped payout list, drill-down, and the two monthly bulk actions. */
export function PayrollPage() {
  const { t } = useTranslation();
  const hasPayroll = useFeature('payroll.teacher');
  const upgradeCta = useUpgradeCta('payroll.teacher');
  const [month, setMonth] = useState(currentMonth());

  const isCurrentMonth = month === currentMonth();
  const payoutsQuery = usePayrollPayouts(month, { enabled: hasPayroll });
  const breakdownQuery = useAttributionBreakdown(month, { enabled: hasPayroll });
  const projectionQuery = usePayrollProjection(month, { enabled: hasPayroll && isCurrentMonth });
  const teachersQuery = useTeachers('active', '');
  const subjectsQuery = useSubjects('all');

  const teachersById = useMemo(
    () => new Map((teachersQuery.data ?? []).map((teacher) => [teacher.id, teacher])),
    [teachersQuery.data],
  );
  const subjectsById = useMemo(
    () => new Map((subjectsQuery.data ?? []).map((subject) => [subject.id, subject])),
    [subjectsQuery.data],
  );
  const breakdownByTeacher = useMemo(
    () => groupBreakdownByTeacher(breakdownQuery.data ?? []),
    [breakdownQuery.data],
  );

  const payouts = payoutsQuery.data ?? [];
  const status: PayrollListStatus = payoutsQuery.isPending
    ? 'loading'
    : payoutsQuery.isError
      ? 'error'
      : payouts.length > 0
        ? 'ready'
        : 'empty';

  const content = (
    <section aria-labelledby="payroll-title" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="space-y-1">
        <h1 id="payroll-title" className="text-xl font-semibold text-foreground">
          {t('payroll.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('payroll.subtitle')}</p>
      </header>

      {isCurrentMonth && projectionQuery.isSuccess && (
        <PayrollProjectionSection
          projections={projectionQuery.data.projections}
          projectedBreakdown={projectionQuery.data.projectedBreakdown}
          teachersById={teachersById}
          subjectsById={subjectsById}
        />
      )}

      <PayrollToolbar month={month} onMonthChange={setMonth} payouts={payouts} />

      <PayrollListContent
        status={status}
        payouts={payouts}
        teachersById={teachersById}
        subjectsById={subjectsById}
        breakdownByTeacher={breakdownByTeacher}
        onRetry={() => void payoutsQuery.refetch()}
      />
    </section>
  );

  if (!hasPayroll) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <LockOverlay
          title={t('nav.payroll')}
          description={t('plan.locked')}
          ctaLabel={upgradeCta.ctaLabel}
          onCta={upgradeCta.onCta}
        >
          <div className="p-8">{content}</div>
        </LockOverlay>
      </div>
    );
  }

  return content;
}
