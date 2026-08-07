import type { WeeklyRecurringSessionRepository } from '../ports/weekly-recurring-session-repository';
import type { CenterHoursRepository } from '../ports/center-hours-repository';
import type { GroupRepository } from '../ports/group-repository';
import type { RoomRepository } from '../ports/room-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, EntityId, UserId } from '../value-objects/ids';
import type { RoomId } from '../entities/room';
import type { GroupId } from '../entities/group';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { WeekdayIndex } from '../value-objects/weekday';
import { applyWrite } from '../entities/write';
import { assertGroupFitsRoom } from '../policies/group-seat-capacity';
import { GroupNotFoundError } from '../errors/group-errors';
import { RoomNotFoundError } from '../errors/room-errors';
import {
  InvalidSessionValidityRangeError,
  WeeklyRecurringSessionNotFoundError,
} from '../errors/scheduling-errors';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from '../entities/weekly-recurring-session';
import {
  weeklyRecurringSessionInputSchema,
  type WeeklyRecurringSessionInput,
} from '../schemas/weekly-recurring-session';
import { assertScheduleFree, resolveWeek } from './weekly-session-scheduling';

export type UpdateWeeklyRecurringSessionInput = WeeklyRecurringSessionInput & {
  centerCode: CenterCode;
  id: WeeklyRecurringSessionId;
  updatedBy: UserId;
};

/**
 * Edits a weekly recurring session's slot (room, teacher, group, day, time,
 * validity window, active). Gated by `core.calendar.week`. Validates with the
 * shared {@link weeklyRecurringSessionInputSchema} (shape only).
 *
 * When the slot is (or becomes) bound to a `groupId`, the SOU-176 seat-fit gate
 * re-runs on the *new* candidate: the group and room must resolve to live rows
 * of the same center and `group.capacity` must not exceed the room's capacity —
 * the same check `CreateWeeklyRecurringSession` runs, so editing a slot's room
 * or group can never introduce an undersized binding.
 *
 * The composite conflict check runs on the *new* candidate against the center's
 * live refs for the (possibly changed) weekday — but the row being edited is
 * **excluded from its own check**, so moving a slot 15 minutes never reads as a
 * clash with itself. `validFrom <= validTo` is re-asserted here (the create path
 * gets it from the entity factory; an in-place edit does not go through the
 * factory, so the guard is explicit).
 *
 * Identity and provenance are preserved: `id`, `centerCode`, `deviceOrigin`,
 * `createdAt`, and `version` are never touched — `version` is the hub's to assign.
 * The write goes through {@link applyWrite}, which advances `updatedAt`/`updatedBy`
 * and records the changed field names only when something actually changed; a
 * no-op edit emits no spurious sync delta. Unknown, tombstoned, or foreign-center
 * ids raise {@link WeeklyRecurringSessionNotFoundError} rather than inserting a row.
 */
export class UpdateWeeklyRecurringSession {
  constructor(
    private readonly sessions: WeeklyRecurringSessionRepository,
    private readonly groups: GroupRepository,
    private readonly rooms: RoomRepository,
    private readonly centerHours: CenterHoursRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: UpdateWeeklyRecurringSessionInput): Promise<WeeklyRecurringSession> {
    this.plan.require('core.calendar.week');
    const fields = weeklyRecurringSessionInputSchema.parse(input);

    const existing = await this.sessions.findById(input.id);
    // Center-scoped: a row from another tenant is not editable here. Redundant on
    // desktop (one DB per center), load-bearing on the future shared backend.
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new WeeklyRecurringSessionNotFoundError(input.id);
    }

    const dayOfWeek = fields.dayOfWeek as WeekdayIndex;
    const roomId = fields.roomId as RoomId;
    const teacherId = fields.teacherId as EntityId | null;
    const groupId = fields.groupId as GroupId | null;
    const start = fields.start as TimeOfDay;
    const end = fields.end as TimeOfDay;
    const { validFrom, validTo } = fields;

    if (validFrom !== null && validTo !== null && validTo < validFrom) {
      throw new InvalidSessionValidityRangeError(validFrom, validTo);
    }

    if (groupId !== null) {
      const group = await this.groups.findById(groupId);
      if (group === null || group.centerCode !== input.centerCode) {
        throw new GroupNotFoundError(groupId);
      }
      const room = await this.rooms.findById(roomId);
      if (room === null || room.centerCode !== input.centerCode) {
        throw new RoomNotFoundError(roomId);
      }
      assertGroupFitsRoom(group.id, group.capacity, room);
    }

    const week = resolveWeek(await this.centerHours.listForCenter(input.centerCode));
    const refs = (await this.sessions.listRefsForDay(input.centerCode, dayOfWeek)).filter(
      (ref) => (ref.id as string) !== (input.id as string),
    );
    assertScheduleFree({ roomId, teacherId, dayOfWeek, start, end }, refs, week);

    const { next, changedFields } = applyWrite(
      existing,
      { roomId, teacherId, groupId, dayOfWeek, start, end, active: fields.active, validFrom, validTo },
      { clock: this.clock, updatedBy: input.updatedBy },
    );
    if (changedFields.length > 0) {
      await this.sessions.save(next);
    }
    return next;
  }
}
