import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { HandCoins } from 'lucide-react';
import { Button, ErrorState, Skeleton } from '@centresoutien/ui';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import type { SubjectView } from '../../lib/subjects/subject-view';
import type { PayrollProjectionResult } from '../../lib/payroll/payroll-gateway';
import { PayrollProjectionSection } from './payroll-projection-section';

type PayrollProjectionStatusProps = {
  query: UseQueryResult<PayrollProjectionResult, Error>;
  teachersById: ReadonlyMap<string, TeacherView>;
  subjectsById: ReadonlyMap<string, SubjectView>;
};

// Renders the current-month projection with an explicit loading / error /
// success state, so a failed read can never masquerade as an empty projection.
export function PayrollProjectionStatus({
  query,
  teachersById,
  subjectsById,
}: PayrollProjectionStatusProps) {
  const { t } = useTranslation();

  if (query.isPending) {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-4" aria-busy="true">
        <Skeleton className="h-5 w-48" />
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        icon={<HandCoins className="h-5 w-5" aria-hidden="true" />}
        title={t('payroll.loadError.title')}
        description={t('payroll.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('payroll.loadError.retry')}
          </Button>
        }
      />
    );
  }

  return (
    <PayrollProjectionSection
      projections={query.data.projections}
      projectedBreakdown={query.data.projectedBreakdown}
      teachersById={teachersById}
      subjectsById={subjectsById}
    />
  );
}
