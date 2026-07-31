import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Group, GroupId } from '../entities/group';
import type { CenterCode } from '../value-objects/ids';

/**
 * Persistence port for Groups. Extends the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`; reads exclude
 * tombstones, no hard delete) with the Group-specific reads the list, restore,
 * and (future) presentation flows need — the same shape {@link RoomRepository}
 * exposes. Groups are identified by their relationships, not people-like
 * matching, so there is no `findByNaturalKey`. The SQLite adapter + migration
 * land alongside this port in SOU-120.
 *
 * There is no `countActive` limit read: unlike Rooms (`maxRooms`), no plan caps
 * the group count, so `CreateGroup`/`RestoreGroup` never check one. Add it only
 * when a `maxGroups` limit actually appears.
 */
export interface GroupRepository extends SoftDeletableRepository<GroupId, Group> {
  /** Every live (non-tombstoned) group of the center, for the list screen. */
  listActive(centerCode: CenterCode): Promise<readonly Group[]>;
  /**
   * Every archived (tombstoned) group of the center, so the UI can offer restore.
   * The mirror of `listActive` — only rows with `deletedAt` set.
   */
  listArchived(centerCode: CenterCode): Promise<readonly Group[]>;
  /**
   * Read a tombstoned group by id so `RestoreGroup` can revive it. Returns null
   * for an unknown or still-live id — the inverse of `findById`, which hides
   * tombstones. Center scoping is enforced by the use case, not here.
   */
  findArchivedById(id: GroupId): Promise<Group | null>;
}
