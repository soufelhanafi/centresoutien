import type { RoomRepository } from '../ports/room-repository';
import type { RoomReferencePort } from '../ports/room-reference';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { RoomId } from '../entities/room';
import type { CenterCode, UserId } from '../value-objects/ids';
import { RoomInUseError, RoomNotFoundError } from '../errors/room-errors';

export type ArchiveRoomInput = {
  centerCode: CenterCode;
  roomId: RoomId;
  updatedBy: UserId;
};

/**
 * Archives (soft-deletes) a Room. Gated by `core.rooms`. The target is
 * center-scoped: the room is loaded first, and an unknown, already-archived, or
 * foreign-center id raises a typed {@link RoomNotFoundError} before anything is
 * touched — so a stale or wrong-tenant id from the renderer can never silently
 * no-op as a success (this mirrors `ArchiveStudent`). It then enforces the
 * ticket's in-use invariant: a room still referenced by any active weekly session
 * cannot be archived — the guard consults the `RoomReferencePort` and rejects with
 * a typed {@link RoomInUseError}. When the room is free it is soft-deleted
 * (tombstone), never hard-deleted, so the row still syncs. The delete timestamp
 * comes from the injected `Clock` (UTC), never `new Date()`, and the deleter's
 * `updatedBy` is stamped on the tombstone so a delete-vs-edit conflict can show
 * *who* archived, not just when.
 */
export class ArchiveRoom {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly references: RoomReferencePort,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ArchiveRoomInput): Promise<void> {
    this.plan.require('core.rooms');

    const existing = await this.rooms.findById(input.roomId);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new RoomNotFoundError(input.roomId);
    }

    if (await this.references.hasActiveSessionForRoom(input.roomId)) {
      throw new RoomInUseError(input.roomId);
    }

    await this.rooms.softDelete(input.roomId, this.clock.now(), input.updatedBy);
  }
}
