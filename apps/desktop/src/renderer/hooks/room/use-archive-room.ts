import { useMutation, useQueryClient } from '@tanstack/react-query';
import { roomsGateway } from '../../lib/rooms/rooms-gateway';
import { roomKeys } from './keys';

/** Archives (soft-deletes) a room. Invalidates every rooms query. */
export function useArchiveRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => roomsGateway.archive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomKeys.all }),
  });
}
