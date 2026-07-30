import { useQuery } from '@tanstack/react-query';
import type { RoomStatus } from '../../lib/rooms/room-view';
import { roomsGateway } from '../../lib/rooms/rooms-gateway';
import { roomKeys } from './keys';

/**
 * Loads the rooms for one lifecycle state — `active` (default list) or
 * `archived` (restore view). Data access goes through the {@link roomsGateway}
 * seam, not `window.api` directly, so the mock adapter swaps for the real IPC
 * one in a single place.
 */
export function useRooms(status: RoomStatus) {
  return useQuery({
    queryKey: roomKeys.list(status),
    queryFn: () => roomsGateway.list({ status }),
    refetchOnWindowFocus: false,
  });
}
