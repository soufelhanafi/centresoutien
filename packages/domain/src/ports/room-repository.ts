import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Room, RoomId } from '../entities/room';
import type { CenterCode } from '../value-objects/ids';

/**
 * Persistence port for Rooms. Extends the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`; reads exclude
 * tombstones, no hard delete) with the Room-specific reads the list, limit, and
 * restore flows need. Rooms are identified by relationships, not people-like
 * matching, so there is no `findByNaturalKey`. The SQLite adapter lands in SOU-33.
 */
export interface RoomRepository extends SoftDeletableRepository<RoomId, Room> {
  /** Every live (non-tombstoned) room of the center, for the list screen. */
  listActive(centerCode: CenterCode): Promise<readonly Room[]>;
  /**
   * Every archived (tombstoned) room of the center, so the UI can offer restore.
   * The mirror of `listActive` — only rows with `deletedAt` set.
   */
  listArchived(centerCode: CenterCode): Promise<readonly Room[]>;
  /** The live room count the `maxRooms` plan limit checks against. */
  countActive(centerCode: CenterCode): Promise<number>;
  /**
   * Read a tombstoned room by id so `RestoreRoom` can revive it. Returns null for
   * an unknown or still-live id — the inverse of `findById`, which hides
   * tombstones. Center scoping is enforced by the use case, not here.
   */
  findArchivedById(id: RoomId): Promise<Room | null>;
}
