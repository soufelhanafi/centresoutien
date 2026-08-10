import { useQuery } from '@tanstack/react-query';
import { centerHoursOverridesGateway } from '../../lib/center-hours-overrides/overrides-gateway';
import { centerHoursOverrideKeys } from './keys';

/**
 * The dated overrides intersecting the inclusive `[start, end]` civil-date span,
 * so the planner can resolve each visible weekday column against its own date
 * (SOU-165). A failed lookup is a soft failure — the caller falls back to the base
 * weekly hours rather than blocking the grid — so the planner never breaks on the
 * override query alone.
 */
export function useCenterHoursOverridesInRange(start: string, end: string) {
  return useQuery({
    queryKey: centerHoursOverrideKeys.listRange(start, end),
    queryFn: () => centerHoursOverridesGateway.list({ start, end }),
    refetchOnWindowFocus: false,
  });
}
