import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Room, RoomId } from '../entities/room';

/**
 * Persistence port for Rooms. Inherits the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`); reads exclude
 * tombstones, and there is no hard delete. Rooms are identified by relationships,
 * not people-like matching, so no `findByNaturalKey` is needed. The SQLite
 * adapter lands in SOU-33.
 */
export type RoomRepository = SoftDeletableRepository<RoomId, Room>;
