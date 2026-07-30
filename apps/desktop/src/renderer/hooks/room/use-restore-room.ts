import { useMutation, useQueryClient } from '@tanstack/react-query';
import { roomsGateway } from '../../lib/rooms/rooms-gateway';
import { roomKeys } from './keys';

/** Restores an archived room back to the active list. Invalidates every rooms query. */
export function useRestoreRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => roomsGateway.restore(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomKeys.all }),
  });
}
