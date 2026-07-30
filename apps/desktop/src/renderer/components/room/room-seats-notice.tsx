import { useTranslation } from 'react-i18next';
import { cn } from '@centresoutien/ui';
import { usePlanStore } from '../../stores/plan-store';

/**
 * Soft plan-limit nudge for `maxRooms` (plan-feature-gate §8). The hard block is
 * enforced in the domain (`CreateRoom`/`RestoreRoom` → `requireBelowLimit`); this
 * only informs, mirroring `StudentSeatsNotice`, so the director sees the cap
 * before hitting a rejected save. Renders nothing on unlimited plans.
 */
export function RoomSeatsNotice({ activeCount }: { activeCount: number }) {
  const { t } = useTranslation();
  const max = usePlanStore((state) => state.plan.limits.maxRooms);
  if (max === 'unlimited') return null;

  const remaining = Math.max(0, max - activeCount);
  const full = remaining === 0;
  const message = full
    ? t('rooms.seats.full', { max })
    : t('rooms.seats.remaining', { count: remaining, max });

  return (
    <p className={cn('text-xs', full ? 'text-destructive' : 'text-muted-foreground')}>{message}</p>
  );
}
