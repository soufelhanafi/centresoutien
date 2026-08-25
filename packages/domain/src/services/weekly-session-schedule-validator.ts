import type { WeeklyRecurringSessionRepository } from '../ports/weekly-recurring-session-repository';
import type { CenterHoursRepository } from '../ports/center-hours-repository';
import type { CenterHoursOverrideRepository } from '../ports/center-hours-override-repository';
import type { TeacherAvailabilityRepository } from '../ports/teacher-availability-repository';
import type { TeacherAvailabilityExceptionRepository } from '../ports/teacher-availability-exception-repository';
import type { EnrollmentRepository } from '../ports/enrollment-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { WeeklyRecurringSessionId } from '../entities/weekly-recurring-session';
import type { GroupId } from '../entities/group';
import type { StudentId } from '../entities/student';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { ScheduledSessionRef } from '../errors/scheduling-errors';
import type { StudentConflictContext } from '../policies/composite-session-conflicts';
import { buildStudentScheduleIndex } from '../policies/student-schedule-conflict';
import { overrideWindowsOn } from '../policies/center-hours-override-policy';
import { recurrenceMaterializationRange } from '../policies/teacher-availability-policy';
import { weekSpanOf, weekdayInWeekOf } from '../value-objects/date-range';
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
  readonly enrollments: EnrollmentRepository;
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
    groupId: GroupId | null,
    excludeId?: WeeklyRecurringSessionId,
  ): Promise<void> {
    const week = resolveWeek(await this.deps.centerHours.listForCenter(centerCode));
    const existing = await this.loadDayRefs(centerCode, fields.dayOfWeek, excludeId);
    const today = this.deps.clock.now().toISOString().slice(0, 10);
    const slotDate = weekdayInWeekOf(today, fields.dayOfWeek);
    const overrideWindows = overrideWindowsOn(
      slotDate,
      fields.dayOfWeek,
      await this.deps.overrides.listOverlapping(centerCode, slotDate, slotDate),
    );
    const materializationRange = recurrenceMaterializationRange(
      fields.validFrom,
      fields.validTo,
      weekSpanOf(today),
    );
    const availability = await loadTeacherAvailabilityForSlot(
      {
        availability: this.deps.availability,
        availabilityExceptions: this.deps.availabilityExceptions,
        plan: this.deps.plan,
      },
      centerCode,
      fields.teacherId,
      materializationRange,
    );
    const studentConflict = await this.loadStudentConflictContext(centerCode, groupId);
    assertScheduleFree(fields, existing, week, overrideWindows, availability, studentConflict);
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

  /**
   * The slot's group roster plus every OTHER group any of those students
   * attends, for the student double-book warning. `undefined` when the slot
   * binds no group or the group's live roster is empty — nothing to check.
   * Deliberately excludes `groupId` itself when fetching other groups' blocks,
   * so the resulting index can never self-match the group's own other slots.
   */
  private async loadStudentConflictContext(
    centerCode: CenterCode,
    groupId: GroupId | null,
  ): Promise<StudentConflictContext | undefined> {
    if (groupId === null) return undefined;
    const roster = (await this.deps.enrollments.listActiveByGroup(groupId)).map((e) => e.studentId);
    if (roster.length === 0) return undefined;

    const rosterEnrollments = await Promise.all(
      roster.map((studentId) => this.deps.enrollments.listActiveByStudent(studentId)),
    );
    const otherGroupIds = new Set<GroupId>();
    for (const enrollments of rosterEnrollments) {
      for (const enrollment of enrollments) {
        if (enrollment.groupId !== groupId) otherGroupIds.add(enrollment.groupId);
      }
    }
    if (otherGroupIds.size === 0) return undefined;

    const otherGroupIdList = [...otherGroupIds];
    const [rosterByGroup, otherGroupSessions] = await Promise.all([
      this.deps.enrollments.listActiveStudentIdsByGroups(otherGroupIdList),
      Promise.all(
        otherGroupIdList.map((otherGroupId) => this.deps.sessions.listActiveByGroupId(centerCode, otherGroupId)),
      ),
    ]);
    const blocksByGroup = new Map<GroupId, { dayOfWeek: WeekdayIndex; start: TimeOfDay; end: TimeOfDay }[]>();
    otherGroupIdList.forEach((otherGroupId, index) => {
      blocksByGroup.set(
        otherGroupId,
        otherGroupSessions[index]!.map((session) => ({
          dayOfWeek: session.dayOfWeek,
          start: session.start,
          end: session.end,
        })),
      );
    });

    return {
      groupId,
      roster: roster as readonly StudentId[],
      studentIndex: buildStudentScheduleIndex(rosterByGroup, blocksByGroup),
    };
  }
}
