import { useRooms } from '../../hooks/room/use-rooms';
import type { RoomStatus } from '../../lib/rooms/room-view';
import { RoomListContent, type RoomListStatus } from './room-list-content';

/**
 * Connects one lifecycle list (active or archived) to its query and derives the
 * display state. Both tabs render this same panel with a different `variant`.
 */
export function RoomListPanel({ variant, onCreate }: { variant: RoomStatus; onCreate: () => void }) {
  const query = useRooms(variant);
  const rooms = query.data ?? [];

  const status: RoomListStatus = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : rooms.length > 0
        ? 'ready'
        : 'empty';

  return (
    <RoomListContent
      status={status}
      variant={variant}
      rooms={rooms}
      onRetry={() => void query.refetch()}
      onCreate={onCreate}
    />
  );
}
