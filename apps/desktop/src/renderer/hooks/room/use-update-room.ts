import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RoomInput } from '../../lib/rooms/room-view';
import { roomsGateway } from '../../lib/rooms/rooms-gateway';
import { roomKeys } from './keys';

/** Edits an existing room's name/capacity. Invalidates every rooms query. */
export function useUpdateRoom(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RoomInput) => roomsGateway.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomKeys.all }),
  });
}
