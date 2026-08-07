import type { RoomRepository } from '../ports/room-repository';
import type { WeeklyRecurringSessionRepository } from '../ports/weekly-recurring-session-repository';
import type { GroupRepository } from '../ports/group-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { applyWrite } from '../entities/write';
import { assertGroupFitsRoom } from '../policies/group-seat-capacity';
import { roomInputSchema, type RoomInput } from '../schemas/room';
import { RoomNotFoundError } from '../errors/room-errors';
import { GroupNotFoundError } from '../errors/group-errors';
import type { Room, RoomId } from '../entities/room';
import type { CenterCode, UserId } from '../value-objects/ids';

export type UpdateRoomInput = RoomInput & {
  centerCode: CenterCode;
  id: RoomId;
  updatedBy: UserId;
};

/**
 * Edits a room's user-facing fields (name, capacity). Gated by `core.rooms`.
 * Validates with the shared `roomInputSchema` so the `capacity ≥ 1` invariant
 * holds here too, not just in the form.
 *
 * Lowering the room's `capacity` re-verifies the SOU-176 seat-fit invariant
 * against every group booked into it by an active weekly session: each bound
 * group's `capacity` must still fit the new ceiling, or the shrink is rejected
 * with `GroupOverCapacityError`. Raising or keeping the capacity never needs the
 * check — it cannot create a new violation.
 *
 * Identity and provenance are preserved: `id`, `centerCode`, `deviceOrigin`,
 * `createdAt`, and `version` are never touched — `version` is the hub's to assign,
 * so a local edit must not bump it. The write goes through
 * `applyWrite`, which advances `updatedAt` (from the Clock port) and `updatedBy`
 * and records the changed field names **only when something actually changed** — a
 * no-op edit returns the row untouched and emits no spurious sync delta. Unknown,
 * archived, or foreign-center ids raise {@link RoomNotFoundError} rather than
 * inserting a new row.
 */
export class UpdateRoom {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly sessions: WeeklyRecurringSessionRepository,
    private readonly groups: GroupRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: UpdateRoomInput): Promise<Room> {
    this.plan.require('core.rooms');
    const { name, capacity } = roomInputSchema.parse({
      name: input.name,
      capacity: input.capacity,
    });

    const existing = await this.rooms.findById(input.id);
    // Center-scoped: a row from another tenant is not editable here. Redundant on
    // desktop (one DB per center), load-bearing on the future shared backend.
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new RoomNotFoundError(input.id);
    }

    if (capacity < existing.capacity) {
      const bookings = await this.sessions.listActiveByRoomId(input.centerCode, existing.id);
      const shrunkRoom = { ...existing, capacity };
      for (const booking of bookings) {
        if (booking.groupId === null) continue;
        const group = await this.groups.findById(booking.groupId);
        if (group === null || group.centerCode !== input.centerCode) {
          throw new GroupNotFoundError(booking.groupId);
        }
        assertGroupFitsRoom(group.id, group.capacity, shrunkRoom);
      }
    }

    const { next, changedFields } = applyWrite(
      existing,
      { name, capacity },
      { clock: this.clock, updatedBy: input.updatedBy },
    );
    if (changedFields.length > 0) {
      await this.rooms.save(next);
    }
    return next;
  }
}
