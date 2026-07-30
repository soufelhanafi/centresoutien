import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { RoomRepository } from '../../../src/ports/room-repository';
import type { Room, RoomId } from '../../../src/entities/room';

/**
 * In-memory {@link RoomRepository} for unit tests. The Room port adds nothing
 * beyond the soft-deletable surface, so the shared base is the whole
 * implementation (`all()` included for assertions).
 */
export class InMemoryRoomRepository
  extends InMemorySoftDeletableRepository<RoomId, Room>
  implements RoomRepository {}
