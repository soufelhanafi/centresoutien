import { useQuery } from '@tanstack/react-query';
import { centerHoursOverridesGateway } from '../../lib/center-hours-overrides/overrides-gateway';
import { centerHoursOverrideKeys } from './keys';

/**
 * Lists every dated center-hours override for the Settings manager. Data access
 * goes through the {@link centerHoursOverridesGateway} seam, not `window.api`, so
 * the concrete IPC adapter stays swappable in one place.
 */
export function useCenterHoursOverrides() {
  return useQuery({
    queryKey: centerHoursOverrideKeys.list(),
    queryFn: () => centerHoursOverridesGateway.list(),
    refetchOnWindowFocus: false,
  });
}
