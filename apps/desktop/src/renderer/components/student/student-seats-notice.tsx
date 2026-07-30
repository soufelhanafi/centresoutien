import { useTranslation } from 'react-i18next';
import { cn } from '@centresoutien/ui';
import { usePlanStore } from '../../stores/plan-store';
import { computeSeats } from '../../lib/students/seats';

/**
 * Soft plan-limit nudge for `maxStudents` (plan-feature-gate §8). The hard block
 * is enforced in the domain; this only informs. Renders nothing on unlimited plans.
 */
export function StudentSeatsNotice({ activeCount }: { activeCount: number }) {
  const { t } = useTranslation();
  const max = usePlanStore((state) => state.plan.limits.maxStudents);
  const seats = computeSeats(max, activeCount);
  if (seats.kind === 'unlimited') return null;

  const message = seats.full
    ? t('students.seats.full', { max: seats.max })
    : t('students.seats.remaining', { count: seats.remaining, max: seats.max });

  return (
    <p className={cn('text-xs', seats.full ? 'text-destructive' : 'text-muted-foreground')}>
      {message}
    </p>
  );
}
