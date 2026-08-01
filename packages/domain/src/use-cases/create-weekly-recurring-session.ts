import type { WeeklyRecurringSessionRepository } from '../ports/weekly-recurring-session-repository';
import type { CenterHoursRepository } from '../ports/center-hours-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, EntityId, UserId } from '../value-objects/ids';
import type { RoomId } from '../entities/room';
import type { GroupId } from '../entities/group';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { WeekdayIndex } from '../value-objects/weekday';
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
import { assertScheduleFree, resolveWeek } from './weekly-session-scheduling';

export type CreateWeeklyRecurringSessionInput = WeeklyRecurringSessionInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/**
 * Books a weekly recurring session (planner slot) for a center. Gated by
 * `core.calendar.week` (every plan; the guard is still explicit so the check has
 * one home). Validates its input with the shared
 * {@link weeklyRecurringSessionInputSchema} — shape only; the ordering invariants
 * live in the domain.
 *
 * Before persisting, it runs the SOU-55 composite conflict check (malformed time →
 * outside center hours → room overlap → teacher overlap) against the center's live
 * refs for that weekday and throws the most-blocking standard scheduling error when
 * the slot clashes. The row is then minted through
 * {@link createWeeklyRecurringSession}, which re-asserts `start < end` and
 * `validFrom <= validTo` — the entity factory is the single home of those
 * structural invariants. Id and envelope come from the injected `IdGenerator` /
 * `Clock`, never `new Date()`.
 */
export class CreateWeeklyRecurringSession {
  constructor(
    private readonly sessions: WeeklyRecurringSessionRepository,
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

    const week = resolveWeek(await this.centerHours.listForCenter(input.centerCode));
    const existing = await this.sessions.listRefsForDay(input.centerCode, dayOfWeek);
    assertScheduleFree({ roomId, teacherId, dayOfWeek, start, end }, existing, week);

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
    });

    await this.sessions.save(session);
    return session;
  }
}
