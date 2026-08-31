import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from '@tanstack/react-router';
import { LockOverlay } from '@centresoutien/ui';
import { DEFAULT_ROUTE } from '../../app/nav-items';
import { useFeature } from '../../hooks/use-feature';
import { useUserPermission } from '../../hooks/use-user-permission';
import { useUpgradeCta } from '../../hooks/use-upgrade-prompt';
import { useTeachers } from '../../hooks/teacher/use-teachers';
import { useSubjects } from '../../hooks/subject/use-subjects';
import { usePayrollPayouts } from '../../hooks/payroll/use-payroll-payouts';
import { useAttributionBreakdown } from '../../hooks/payroll/use-attribution-breakdown';
import { usePayrollProjection } from '../../hooks/payroll/use-payroll-projection';
import { groupBreakdownByTeacher } from '../../lib/payroll/attribution-grouping';
import { currentMonth } from '../../lib/payroll/month';
import { PayrollToolbar } from '../../components/payroll/payroll-toolbar';
import { PayrollProjectionStatus } from '../../components/payroll/payroll-projection-status';
import { PayrollListContent, type PayrollListStatus } from '../../components/payroll/payroll-list-content';

/** Payroll dashboard (SOU-76): month-scoped payout list, drill-down, and the two monthly bulk actions. */
export function PayrollPage() {
  const { t } = useTranslation();
  const hasPayroll = useFeature('payroll.teacher');
  const upgradeCta = useUpgradeCta('payroll.teacher');
  const hasPermission = useUserPermission('nav.payroll');
  const [month, setMonth] = useState(currentMonth());

  const isCurrentMonth = month === currentMonth();
  const payoutsQuery = usePayrollPayouts(month, { enabled: hasPayroll && hasPermission });
  // The drill-down only expands a finalized payout row, so it is never needed
  // for the open month (no payout rows exist yet) — skipping it avoids a second
  // collected-ledger scan that the projection already performs.
  const breakdownQuery = useAttributionBreakdown(month, {
    enabled: hasPayroll && hasPermission && !isCurrentMonth,
  });
  const projectionQuery = usePayrollProjection(month, {
    enabled: hasPayroll && hasPermission && isCurrentMonth,
  });
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

      {isCurrentMonth && (
        <PayrollProjectionStatus query={projectionQuery} teachersById={teachersById} subjectsById={subjectsById} />
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

  // Direct hash navigation bypasses the sidebar's own hiding (nav-item.tsx) — the
  // route itself must refuse a denied assistant too, not just the link to it.
  // Checked after every hook above (rules of hooks), before the plan-lock render.
  if (!hasPermission) return <Navigate to={DEFAULT_ROUTE} replace />;

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
