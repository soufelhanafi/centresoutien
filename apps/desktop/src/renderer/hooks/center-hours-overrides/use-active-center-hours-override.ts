import { useQuery } from '@tanstack/react-query';
import { centerHoursOverridesGateway } from '../../lib/center-hours-overrides/overrides-gateway';
import { centerHoursOverrideKeys } from './keys';

/**
 * The dated override in effect on `date` (`YYYY-MM-DD`), or `null` when the
 * center runs its regular weekly hours that day. The planner reads this to gray
 * out special-period hours, including a mid-day iftar gap. A failed lookup is a
 * soft failure — the caller falls back to base hours rather than blocking the
 * grid — so the planner never breaks on the override query alone.
 */
export function useActiveCenterHoursOverride(date: string) {
  return useQuery({
    queryKey: centerHoursOverrideKeys.active(date),
    queryFn: () => centerHoursOverridesGateway.getActive(date),
    refetchOnWindowFocus: false,
  });
}
