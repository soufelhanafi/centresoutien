import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { HolidayInput } from '../../lib/holidays/holiday-view';
import { holidaysGateway } from '../../lib/holidays/holidays-gateway';
import { holidayKeys } from './keys';

/** Edits an existing holiday's name/kind/date range. Invalidates every holidays query. */
export function useUpdateHoliday(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HolidayInput) => holidaysGateway.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: holidayKeys.all }),
  });
}
