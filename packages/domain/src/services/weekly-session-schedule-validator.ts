import type { WeeklyRecurringSessionRepository } from '../ports/weekly-recurring-session-repository';
import type { CenterHoursRepository } from '../ports/center-hours-repository';
import type { CenterHoursOverrideRepository } from '../ports/center-hours-override-repository';
import type { TeacherAvailabilityRepository } from '../ports/teacher-availability-repository';
import type { TeacherAvailabilityExceptionRepository } from '../ports/teacher-availability-exception-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { WeeklyRecurringSessionId } from '../entities/weekly-recurring-session';
import type { ScheduledSessionRef } from '../errors/scheduling-errors';
import { overrideWindowsOn } from '../policies/center-hours-override-policy';
import { weekdayInWeekOf } from '../value-objects/date-range';
import { loadTeacherAvailabilityForSlot } from '../use-cases/teacher-availability-slot-check';
import {
  assertScheduleFree,
  resolveWeek,
  type ScheduleCandidateFields,
} from '../use-cases/weekly-session-scheduling';

/**
 * The infrastructure the schedule validator reads to gate one candidate slot.
 * Grouped as one cohesive dependency so the create/edit use cases inject a single
 * validator instead of six scheduling ports each.
 */
export type SchedulingDeps = {
  readonly sessions: WeeklyRecurringSessionRepository;
  readonly centerHours: CenterHoursRepository;
  readonly overrides: CenterHoursOverrideRepository;
  readonly availability: TeacherAvailabilityRepository;
  readonly availabilityExceptions: TeacherAvailabilityExceptionRepository;
  readonly clock: Clock;
  readonly plan: PlanPolicy;
};

/**
 * Owns the SOU-55/165/283 composite conflict pass shared by the manual create and
 * edit paths: it resolves the center's week (with the shared default fallback),
 * lists that weekday's live session refs (excluding the row being edited on
 * update), computes the slot's concrete date via the injected clock, resolves any
 * active center-hours override window and the teacher's availability for that date,
 * then delegates the verdict to {@link assertScheduleFree}. Pure domain — the same
 * check runs identically for both callers, so the two use cases no longer inline
 * (and drift on) the block.
 */
export class WeeklySessionScheduleValidator {
  constructor(private readonly deps: SchedulingDeps) {}

  async assertSlotFree(
    centerCode: CenterCode,
    fields: ScheduleCandidateFields,
    excludeId?: WeeklyRecurringSessionId,
  ): Promise<void> {
    const week = resolveWeek(await this.deps.centerHours.listForCenter(centerCode));
    const existing = await this.loadDayRefs(centerCode, fields.dayOfWeek, excludeId);
    const slotDate = weekdayInWeekOf(this.deps.clock.now().toISOString().slice(0, 10), fields.dayOfWeek);
    const overrideWindows = overrideWindowsOn(
      slotDate,
      fields.dayOfWeek,
      await this.deps.overrides.listOverlapping(centerCode, slotDate, slotDate),
    );
    const availability = await loadTeacherAvailabilityForSlot(
      {
        availability: this.deps.availability,
        availabilityExceptions: this.deps.availabilityExceptions,
        plan: this.deps.plan,
      },
      centerCode,
      fields.teacherId,
      slotDate,
    );
    assertScheduleFree(fields, existing, week, overrideWindows, availability);
  }

  private async loadDayRefs(
    centerCode: CenterCode,
    dayOfWeek: WeekdayIndex,
    excludeId?: WeeklyRecurringSessionId,
  ): Promise<readonly ScheduledSessionRef[]> {
    const refs = await this.deps.sessions.listRefsForDay(centerCode, dayOfWeek);
    if (excludeId === undefined) return refs;
    return refs.filter((ref) => (ref.id as string) !== (excludeId as string));
  }
}
