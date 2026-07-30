import type { RoomReferencePort } from '../../../src/ports/room-reference';
import type { RoomId } from '../../../src/entities/room';

/**
 * Configurable fake for the {@link RoomReferencePort}. `referenced` holds the ids
 * that report an active session, so a test can arrange either branch of the
 * `ArchiveRoom` in-use guard deterministically without the (not-yet-built)
 * Session repository.
 */
export function fakeRoomReference(referenced: readonly RoomId[] = []): RoomReferencePort {
  const inUse = new Set<string>(referenced);
  return {
    hasActiveSessionForRoom: async (roomId: RoomId) => inUse.has(roomId),
  };
}
