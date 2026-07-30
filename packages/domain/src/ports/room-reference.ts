import type { RoomId } from '../entities/room';

/**
 * ⚠️ DECLARED CONTRACT ONLY — NO ADAPTER IN SOU-32.
 *
 * Publishes the *shape* the `ArchiveRoom` in-use guard depends on so the guard is
 * fully testable now (against an in-memory fake) while the real implementation is
 * still on the roadmap. The concrete adapter — a query over active weekly
 * sessions — lands with the Session repository in **SOU-53**; it is wired into
 * `ArchiveRoom` at the composition root then, with no change to this contract or
 * to the use case. Same declared-only pattern as SOU-40's `StudentParentLink`.
 *
 * "Active" means: a weekly recurring session that is not soft-deleted and
 * references this room. A room with any such session cannot be archived.
 */
export interface RoomReferencePort {
  /** True when at least one active weekly session references the room. */
  hasActiveSessionForRoom(roomId: RoomId): Promise<boolean>;
}
