import type { WeeklyRecurringSessionRepository } from '../ports/weekly-recurring-session-repository';
import type { GroupRepository } from '../ports/group-repository';
import type { RoomRepository } from '../ports/room-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
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
import type { WeeklySessionScheduleValidator } from '../services/weekly-session-schedule-validator';
import {
  assertGroupBindingFitsRoom,
  brandSlotFields,
  toScheduleCandidate,
  type ParsedSlotFields,
} from './weekly-session-scheduling';

export type CreateWeeklyRecurringSessionInput = WeeklyRecurringSessionInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
  /**
   * SOU-183: when `true`, commit the slot even if it clashes with the live
   * schedule — the composite conflict check (room/teacher double-book, outside
   * center hours, teacher-availability warning) is skipped and the created row is
   * stamped `conflictAccepted = true`. Never relaxes the seat-fit or group/room
   * not-found checks.
   */
  allowScheduleConflict?: boolean;
};

/** The persist + gate collaborators the create path keeps outside the validator. */
export type CreateSessionDeps = {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly plan: PlanPolicy;
};

/**
 * Books a weekly recurring session (planner slot) for a center. Gated by
 * `core.calendar.week`; validates its input shape with
 * {@link weeklyRecurringSessionInputSchema}, the ordering invariants staying in the
 * domain.
 *
 * When the slot binds a `groupId` it runs the SOU-176 seat-fit gate
 * ({@link assertGroupBindingFitsRoom}), then — unless `allowScheduleConflict`
 * forces past it — the composite conflict pass via the shared
 * {@link WeeklySessionScheduleValidator}. The row is minted through
 * {@link createWeeklyRecurringSession}, the single home of the `start < end` /
 * `validFrom <= validTo` structural invariants. Id and envelope come from the
 * injected {@link IdGenerator} / {@link Clock}, never `new Date()`.
 */
export class CreateWeeklyRecurringSession {
  constructor(
    private readonly sessions: WeeklyRecurringSessionRepository,
    private readonly groups: GroupRepository,
    private readonly rooms: RoomRepository,
    private readonly validator: WeeklySessionScheduleValidator,
    private readonly deps: CreateSessionDeps,
  ) {}

  async execute(input: CreateWeeklyRecurringSessionInput): Promise<WeeklyRecurringSession> {
    this.deps.plan.require('core.calendar.week');
    const fields = weeklyRecurringSessionInputSchema.parse(input);
    const slot = brandSlotFields(fields);

    await assertGroupBindingFitsRoom(
      { groups: this.groups, rooms: this.rooms },
      input.centerCode,
      slot.groupId,
      slot.roomId,
    );

    const forced = input.allowScheduleConflict === true;
    if (!forced) {
      await this.validator.assertSlotFree(input.centerCode, toScheduleCandidate(slot));
    }

    const session = this.mint(input, slot, fields, forced);
    await this.sessions.save(session);
    return session;
  }

  private mint(
    input: CreateWeeklyRecurringSessionInput,
    slot: ParsedSlotFields,
    fields: WeeklyRecurringSessionInput,
    forced: boolean,
  ): WeeklyRecurringSession {
    return createWeeklyRecurringSession({
      id: this.deps.ids.next(WEEKLY_RECURRING_SESSION_ID_PREFIX) as WeeklyRecurringSessionId,
      envelope: newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.deps.clock,
      ),
      roomId: slot.roomId,
      teacherId: slot.teacherId,
      groupId: slot.groupId,
      dayOfWeek: slot.dayOfWeek,
      start: slot.start,
      end: slot.end,
      validFrom: fields.validFrom,
      validTo: fields.validTo,
      active: fields.active,
      conflictAccepted: forced,
    });
  }
}
