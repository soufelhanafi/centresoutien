import { useMutation, useQueryClient } from '@tanstack/react-query';
import { holidaysGateway } from '../../lib/holidays/holidays-gateway';
import { holidayKeys } from './keys';

/** Restores an archived holiday back to the active list. Invalidates every holidays query. */
export function useRestoreHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => holidaysGateway.restore(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: holidayKeys.all }),
  });
}
