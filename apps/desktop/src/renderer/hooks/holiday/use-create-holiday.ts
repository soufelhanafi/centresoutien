import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { HolidayInput } from '../../lib/holidays/holiday-view';
import { holidaysGateway } from '../../lib/holidays/holidays-gateway';
import { holidayKeys } from './keys';

/**
 * Creates a holiday. On success it invalidates every holidays query so the active
 * list (and the year-filter options) refetch. The gateway maps this to the
 * `holiday.create` IPC channel.
 */
export function useCreateHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HolidayInput) => holidaysGateway.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: holidayKeys.all }),
  });
}
