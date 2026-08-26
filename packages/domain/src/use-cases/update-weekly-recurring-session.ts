import type { WeeklyRecurringSessionRepository } from '../ports/weekly-recurring-session-repository';
import type { GroupRepository } from '../ports/group-repository';
import type { RoomRepository } from '../ports/room-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';
import { applyWrite } from '../entities/write';
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
import type { WeeklySessionScheduleValidator } from '../services/weekly-session-schedule-validator';
import {
  assertGroupBindingFitsRoom,
  brandSlotFields,
  toScheduleCandidate,
  type ParsedSlotFields,
} from './weekly-session-scheduling';

export type UpdateWeeklyRecurringSessionInput = WeeklyRecurringSessionInput & {
  centerCode: CenterCode;
  id: WeeklyRecurringSessionId;
  updatedBy: UserId;
  /**
   * SOU-283: when `true`, commit the edited slot even if it clashes with the live
   * schedule — the composite conflict check is skipped and the row is stamped
   * `conflictAccepted = true`, mirroring create. The seat-fit and validity-range
   * guards run unconditionally.
   */
  allowScheduleConflict?: boolean;
};

/** The persist + gate collaborators the edit path keeps outside the validator. */
export type UpdateSessionDeps = {
  readonly clock: Clock;
  readonly plan: PlanPolicy;
};

/**
 * Edits a weekly recurring session's slot (room, teacher, group, day, time,
 * validity window, active). Gated by `core.calendar.week`; validates shape with
 * {@link weeklyRecurringSessionInputSchema}.
 *
 * When the (possibly changed) slot binds a `groupId`, the SOU-176 seat-fit gate
 * re-runs on the new candidate. The composite conflict pass runs through the shared
 * {@link WeeklySessionScheduleValidator} with the row **excluded from its own
 * check**, so nudging a slot never reads as a self-clash; `allowScheduleConflict`
 * forces past a flagged clash. `validFrom <= validTo` is re-asserted here (the edit
 * does not go through the entity factory). Identity/provenance (`id`, `centerCode`,
 * `deviceOrigin`, `createdAt`, `version`) is preserved; the write goes through
 * {@link applyWrite}, which advances `updatedAt`/`updatedBy` only on a real change.
 * Unknown, tombstoned, or foreign-center ids raise
 * {@link WeeklyRecurringSessionNotFoundError}.
 */
export class UpdateWeeklyRecurringSession {
  constructor(
    private readonly sessions: WeeklyRecurringSessionRepository,
    private readonly groups: GroupRepository,
    private readonly rooms: RoomRepository,
    private readonly validator: WeeklySessionScheduleValidator,
    private readonly deps: UpdateSessionDeps,
  ) {}

  async execute(input: UpdateWeeklyRecurringSessionInput): Promise<WeeklyRecurringSession> {
    this.deps.plan.require('core.calendar.week');
    const fields = weeklyRecurringSessionInputSchema.parse(input);

    const existing = await this.sessions.findById(input.id);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new WeeklyRecurringSessionNotFoundError(input.id);
    }

    const slot = brandSlotFields(fields);
    if (fields.validFrom !== null && fields.validTo !== null && fields.validTo < fields.validFrom) {
      throw new InvalidSessionValidityRangeError(fields.validFrom, fields.validTo);
    }

    await assertGroupBindingFitsRoom(
      { groups: this.groups, rooms: this.rooms },
      input.centerCode,
      slot.groupId,
      slot.roomId,
    );

    const forced = input.allowScheduleConflict === true;
    if (!forced) {
      await this.validator.assertSlotFree(input.centerCode, toScheduleCandidate(slot), slot.groupId, input.id);
    }

    return this.applyEdit(existing, slot, fields, forced, input.updatedBy);
  }

  private async applyEdit(
    existing: WeeklyRecurringSession,
    slot: ParsedSlotFields,
    fields: WeeklyRecurringSessionInput,
    forced: boolean,
    updatedBy: UserId,
  ): Promise<WeeklyRecurringSession> {
    const { next, changedFields } = applyWrite(
      existing,
      {
        roomId: slot.roomId,
        teacherId: slot.teacherId,
        groupId: slot.groupId,
        dayOfWeek: slot.dayOfWeek,
        start: slot.start,
        end: slot.end,
        active: fields.active,
        validFrom: fields.validFrom,
        validTo: fields.validTo,
        conflictAccepted: forced,
      },
      { clock: this.deps.clock, updatedBy },
    );
    if (changedFields.length > 0) {
      await this.sessions.save(next);
    }
    return next;
  }
}
