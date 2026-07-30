import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RoomInput } from '../../lib/rooms/room-view';
import { roomsGateway } from '../../lib/rooms/rooms-gateway';
import { roomKeys } from './keys';

/**
 * Creates a room. On success it invalidates every rooms query so the active list
 * (and its count) refetch. The gateway maps this to `room.create` once the real
 * adapter replaces the mock.
 */
export function useCreateRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RoomInput) => roomsGateway.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomKeys.all }),
  });
}
