import { useQuery } from '@tanstack/react-query';
import type { HolidayStatus } from '../../lib/holidays/holiday-view';
import { holidaysGateway } from '../../lib/holidays/holidays-gateway';
import { holidayKeys } from './keys';

/**
 * Loads the holidays for one lifecycle state — `active` (default list) or
 * `archived` (restore view). Data access goes through the {@link holidaysGateway}
 * seam, not `window.api` directly, so the concrete IPC adapter stays swappable in
 * a single place. The year filter is applied client-side by callers.
 */
export function useHolidays(status: HolidayStatus) {
  return useQuery({
    queryKey: holidayKeys.list(status),
    queryFn: () => holidaysGateway.list({ status }),
    refetchOnWindowFocus: false,
  });
}
