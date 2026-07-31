import { useMutation, useQueryClient } from '@tanstack/react-query';
import { holidaysGateway } from '../../lib/holidays/holidays-gateway';
import { holidayKeys } from './keys';

/** Archives (soft-deletes) a holiday. Invalidates every holidays query. */
export function useArchiveHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => holidaysGateway.archive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: holidayKeys.all }),
  });
}
