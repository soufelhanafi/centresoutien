import type { WeeklyRecurringSessionRepository } from '../ports/weekly-recurring-session-repository';
import type { CenterHoursRepository } from '../ports/center-hours-repository';
import type { GroupRepository } from '../ports/group-repository';
import type { RoomRepository } from '../ports/room-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, EntityId, UserId } from '../value-objects/ids';
import type { RoomId } from '../entities/room';
import type { GroupId } from '../entities/group';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { WeekdayIndex } from '../value-objects/weekday';
import { newEnvelope } from '../entities/envelope';
import { assertGroupFitsRoom } from '../policies/group-seat-capacity';
import { GroupNotFoundError } from '../errors/group-errors';
import { RoomNotFoundError } from '../errors/room-errors';
import {
  WEEKLY_RECURRING_SESSION_ID_PREFIX,
  createWeeklyRecurringSession,
  type WeeklyRecurringSession,
  type WeeklyRecurringSessionId,
} from '../entities/weekly-recurring-session';
import {
  weeklyRecurringSessionInputSchema,
  type WeeklyRecurringSessionInput,
} from '../schemas/weekly-recurring-session';
import { assertScheduleFree, resolveWeek } from './weekly-session-scheduling';

export type CreateWeeklyRecurringSessionInput = WeeklyRecurringSessionInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
  /**
   * SOU-183: when `true`, commit the slot even if it clashes with the live
   * schedule — the composite {@link assertScheduleFree} check (room double-book,
   * teacher double-book, outside center hours) is skipped and the created row is
   * stamped `conflictAccepted = true`. Absent/`false` keeps the default behavior:
   * a clash throws its standard scheduling error. This never relaxes the seat-fit
   * ({@link assertGroupFitsRoom}) or the group/room not-found checks — those run
   * unconditionally.
   */
  allowScheduleConflict?: boolean;
};

/**
 * Books a weekly recurring session (planner slot) for a center. Gated by
 * `core.calendar.week` (every plan; the guard is still explicit so the check has
 * one home). Validates its input with the shared
 * {@link weeklyRecurringSessionInputSchema} — shape only; the ordering invariants
 * live in the domain.
 *
 * When the slot is bound to a `groupId`, it runs the SOU-176 seat-fit gate
 * before the schedule checks: the group and the room must resolve to live rows
 * of the same center (`GroupNotFoundError` / `RoomNotFoundError` otherwise), and
 * `group.capacity` must not exceed the room's (`GroupOverCapacityError`) — a
 * group can no longer be kept under its room's size at definition, so the check
 * belongs exactly here, where the room is actually chosen.
 *
 * Then the SOU-55 composite conflict check (malformed time → outside center
 * hours → room overlap → teacher overlap) runs against the center's live refs
 * for that weekday and throws the most-blocking standard scheduling error when
 * the slot clashes — unless `allowScheduleConflict` is `true` (SOU-183), in which
 * case that single check is skipped and the row is stamped
 * `conflictAccepted = true` to record the intentional double-book. The seat-fit
 * gate and the group/room not-found checks are never skipped. The row is then
 * minted through
 * {@link createWeeklyRecurringSession}, which re-asserts `start < end` and
 * `validFrom <= validTo` — the entity factory is the single home of those
 * structural invariants. Id and envelope come from the injected `IdGenerator` /
 * `Clock`, never `new Date()`.
 */
export class CreateWeeklyRecurringSession {
  constructor(
    private readonly sessions: WeeklyRecurringSessionRepository,
    private readonly groups: GroupRepository,
    private readonly rooms: RoomRepository,
    private readonly centerHours: CenterHoursRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CreateWeeklyRecurringSessionInput): Promise<WeeklyRecurringSession> {
    this.plan.require('core.calendar.week');
    const fields = weeklyRecurringSessionInputSchema.parse(input);

    const dayOfWeek = fields.dayOfWeek as WeekdayIndex;
    const roomId = fields.roomId as RoomId;
    const teacherId = fields.teacherId as EntityId | null;
    const groupId = fields.groupId as GroupId | null;
    const start = fields.start as TimeOfDay;
    const end = fields.end as TimeOfDay;

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

    const forced = input.allowScheduleConflict === true;
    if (!forced) {
      const week = resolveWeek(await this.centerHours.listForCenter(input.centerCode));
      const existing = await this.sessions.listRefsForDay(input.centerCode, dayOfWeek);
      assertScheduleFree({ roomId, teacherId, dayOfWeek, start, end }, existing, week);
    }

    const session = createWeeklyRecurringSession({
      id: this.ids.next(WEEKLY_RECURRING_SESSION_ID_PREFIX) as WeeklyRecurringSessionId,
      envelope: newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      roomId,
      teacherId,
      groupId,
      dayOfWeek,
      start,
      end,
      validFrom: fields.validFrom,
      validTo: fields.validTo,
      active: fields.active,
      conflictAccepted: forced,
    });

    await this.sessions.save(session);
    return session;
  }
}
