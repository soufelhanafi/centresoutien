import type { RoomStatus } from '../../lib/rooms/room-view';

/** Query keys for the rooms module. Mutations invalidate `roomKeys.all`. */
export const roomKeys = {
  all: ['rooms'] as const,
  list: (status: RoomStatus) => ['rooms', 'list', status] as const,
};
