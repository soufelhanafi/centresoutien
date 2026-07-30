import type { RoomRepository } from '../ports/room-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import { roomInputSchema, type RoomInput } from '../schemas/room';
import { ROOM_ID_PREFIX, type Room, type RoomId } from '../entities/room';

export type CreateRoomInput = RoomInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/**
 * Creates a Room for a center. Gated by `core.rooms` (present on every plan; the
 * guard is still explicit so the check has one home) and bounded by the plan's
 * `maxRooms` limit. Validates its input with the shared `roomInputSchema`, which
 * carries the `capacity ≥ 1` invariant — the domain is the authority even though
 * the form validates first. A new room is always `active`.
 */
export class CreateRoom {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CreateRoomInput): Promise<Room> {
    this.plan.require('core.rooms');
    const { name, capacity } = roomInputSchema.parse({
      name: input.name,
      capacity: input.capacity,
    });

    const activeCount = await this.rooms.countActive(input.centerCode);
    this.plan.requireBelowLimit('maxRooms', activeCount);

    const room: Room = {
      id: this.ids.next(ROOM_ID_PREFIX) as RoomId,
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      name,
      capacity,
      active: true,
    };

    await this.rooms.save(room);
    return room;
  }
}
