import { useTranslation } from 'react-i18next';
import { cn } from '@centresoutien/ui';
import { usePlanStore } from '../../stores/plan-store';

/**
 * Soft plan-limit nudge for `maxTeachers` (plan-feature-gate §8). The hard block
 * is enforced in the domain (`CreateTeacher` → the `maxTeachers` limit); this only
 * informs, mirroring `RoomSeatsNotice`, so the director sees the cap before
 * hitting a rejected save. Renders nothing on unlimited plans.
 */
export function TeacherSeatsNotice({ activeCount }: { activeCount: number }) {
  const { t } = useTranslation();
  const max = usePlanStore((state) => state.plan.limits.maxTeachers);
  if (max === 'unlimited') return null;

  const remaining = Math.max(0, max - activeCount);
  const full = remaining === 0;
  const message = full
    ? t('teachers.seats.full', { max })
    : t('teachers.seats.remaining', { count: remaining, max });

  return (
    <p className={cn('text-xs', full ? 'text-destructive' : 'text-muted-foreground')}>{message}</p>
  );
}
