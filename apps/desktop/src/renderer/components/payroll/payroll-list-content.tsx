import { useTranslation } from 'react-i18next';
import { HandCoins } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '@centresoutien/ui';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import type { SubjectView } from '../../lib/subjects/subject-view';
import type { TeacherAttributionBreakdownEntryView, TeacherPayoutView } from '../../lib/payroll/teacher-payout-view';
import { PayrollTable } from './payroll-table';

export type PayrollListStatus = 'loading' | 'error' | 'empty' | 'ready';

type PayrollListContentProps = {
  status: PayrollListStatus;
  payouts: readonly TeacherPayoutView[];
  teachersById: ReadonlyMap<string, TeacherView>;
  subjectsById: ReadonlyMap<string, SubjectView>;
  breakdownByTeacher: ReadonlyMap<string, readonly TeacherAttributionBreakdownEntryView[]>;
  onRetry: () => void;
};

/** Renders the correct state for the month's payout list: loading, error, empty, or table. */
export function PayrollListContent({
  status,
  payouts,
  teachersById,
  subjectsById,
  breakdownByTeacher,
  onRetry,
}: PayrollListContentProps) {
  const { t } = useTranslation();

  if (status === 'loading') {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-4" aria-busy="true">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <EmptyState
        icon={<HandCoins className="h-5 w-5" aria-hidden="true" />}
        title={t('payroll.loadError.title')}
        description={t('payroll.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('payroll.loadError.retry')}
          </Button>
        }
      />
    );
  }

  if (status === 'empty') {
    return (
      <EmptyState
        icon={<HandCoins className="h-5 w-5" aria-hidden="true" />}
        title={t('payroll.empty.title')}
        description={t('payroll.empty.body')}
      />
    );
  }

  return (
    <PayrollTable
      payouts={payouts}
      teachersById={teachersById}
      subjectsById={subjectsById}
      breakdownByTeacher={breakdownByTeacher}
    />
  );
}
