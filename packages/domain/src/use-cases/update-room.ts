import type { RoomRepository } from '../ports/room-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { applyWrite } from '../entities/write';
import { roomInputSchema, type RoomInput } from '../schemas/room';
import { RoomNotFoundError } from '../errors/room-errors';
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
 * Identity and provenance are preserved: `id`, `centerCode`, `deviceOrigin`,
 * `createdAt`, and `version` are never touched — `version` is the hub's to assign,
 * so a local edit must not bump it (invariant 2/5). The write goes through
 * `applyWrite`, which advances `updatedAt` (from the Clock port) and `updatedBy`
 * and records the changed field names **only when something actually changed** — a
 * no-op edit returns the row untouched and emits no spurious sync delta. Unknown,
 * archived, or foreign-center ids raise {@link RoomNotFoundError} rather than
 * inserting a new row.
 */
export class UpdateRoom {
  constructor(
    private readonly rooms: RoomRepository,
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
