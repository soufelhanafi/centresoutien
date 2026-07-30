import type { RoomRepository } from '../ports/room-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { RoomNotFoundError } from '../errors/room-errors';
import type { Room, RoomId } from '../entities/room';
import type { CenterCode, UserId } from '../value-objects/ids';

export type RestoreRoomInput = {
  centerCode: CenterCode;
  roomId: RoomId;
  updatedBy: UserId;
};

/**
 * Restores an archived room — clears its tombstone (`deletedAt = null`) so it
 * returns to the live list. Gated by `core.rooms`. The target is read via
 * `findArchivedById` (the only path that sees tombstones), and an unknown,
 * already-live, or foreign-center id raises {@link RoomNotFoundError} before
 * anything is touched.
 *
 * Restoring brings a live room back, so it counts against the plan's `maxRooms`
 * limit just like `CreateRoom` — otherwise archive-then-create-then-restore would
 * silently exceed the cap. The clear-and-save reuses the ordinary write path:
 * `updatedAt` (from the Clock port, UTC) and `updatedBy` advance; `version` stays
 * the hub's to assign; the id, provenance, and `createdAt` are preserved.
 */
export class RestoreRoom {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: RestoreRoomInput): Promise<Room> {
    this.plan.require('core.rooms');

    const archived = await this.rooms.findArchivedById(input.roomId);
    if (archived === null || archived.centerCode !== input.centerCode) {
      throw new RoomNotFoundError(input.roomId);
    }

    const activeCount = await this.rooms.countActive(input.centerCode);
    this.plan.requireBelowLimit('maxRooms', activeCount);

    const restored: Room = {
      ...archived,
      deletedAt: null,
      updatedAt: this.clock.now(),
      updatedBy: input.updatedBy,
    };
    await this.rooms.save(restored);
    return restored;
  }
}
