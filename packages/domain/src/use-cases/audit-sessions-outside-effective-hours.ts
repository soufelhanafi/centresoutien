import type { SessionOccurrenceViewReadPort } from '../ports/session-occurrence-view-read-port';
import type { EnrollmentRepository } from '../ports/enrollment-repository';
import type { Clock } from '../ports/clock';
import type { HolidayRepository } from '../ports/holiday-repository';
import type { CenterHoursRepository } from '../ports/center-hours-repository';
import type { CenterHoursOverrideRepository } from '../ports/center-hours-override-repository';
import type { TeacherAvailabilityRepository } from '../ports/teacher-availability-repository';
import type { TeacherAvailabilityExceptionRepository } from '../ports/teacher-availability-exception-repository';
import type { WeeklySessionViewReadPort } from '../ports/weekly-session-view-read-port';
import type { PlanPolicy } from '../plans/plan-policy';
import { toEntityId, type CenterCode, type EntityId } from '../value-objects/ids';
import type { SessionOccurrenceView } from '../read-models/session-occurrence-view';
import type { DayHours } from '../policies/session-conflict-policy';
import type { TeacherAvailabilityRules } from '../policies/teacher-availability-policy';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { GroupId } from '../entities/group';
import { auditReasonsFor, type StrandedSession } from '../policies/session-audit-reason';
import { buildResourceScheduleIndex } from '../policies/session-resource-conflict';
import {
  findStrandedRecurringSlots,
  type StrandedRecurringSlot,
} from '../policies/stranded-recurring-slot';
import {
  groupStrandedSessions,
  type StrandedSessionGroup,
} from '../policies/stranded-session-grouping';
import { resolveWeek } from '../schemas/center-hours';

export type { SessionAuditReason, StrandedSession } from '../policies/session-audit-reason';
export type { StrandedSessionGroup } from '../policies/stranded-session-grouping';
export type { StrandedRecurringSlot } from '../policies/stranded-recurring-slot';

export type AuditSessionsOutsideEffectiveHoursResult = {
  groups: readonly StrandedSessionGroup[];
  /** Live weekly templates a teacher-availability edit now strands, before any
   *  concrete occurrence of them is even materialized (SOU-296bis). */
  recurringSlotWarnings: readonly StrandedRecurringSlot[];
};

export type AuditSessionsOutsideEffectiveHoursInput = {
  centerCode: CenterCode;
};

/** The read ports + clock/plan the center-wide sweep reads; never mutates. */
export type AuditSessionsDeps = {
  readonly occurrences: SessionOccurrenceViewReadPort;
  readonly enrollments: EnrollmentRepository;
  readonly holidays: HolidayRepository;
  readonly centerHours: CenterHoursRepository;
  readonly overrides: CenterHoursOverrideRepository;
  readonly availability: TeacherAvailabilityRepository;
  readonly availabilityExceptions: TeacherAvailabilityExceptionRepository;
  readonly weeklySessions: WeeklySessionViewReadPort;
  readonly plan: PlanPolicy;
  readonly clock: Clock;
};

/**
 * Read-only, center-wide standing audit (SOU-201, extended SOU-296) reporting every
 * live materialized session the *current* state now strands, across the full
 * conflict taxonomy: hours, holidays, teacher availability, room/teacher
 * double-books, archived rooms, and room over-capacity. It never mutates;
 * cancelling a stranded occurrence is `CancelSession`.
 *
 * Enriched occurrences come through {@link SessionOccurrenceViewReadPort} (already
 * excluding cancelled rows); each verdict delegates to {@link auditReasonsFor},
 * which reuses the same policies interactive scheduling trusts. Results are
 * deduplicated in the domain via {@link groupStrandedSessions} (SOU-262 two-pass
 * split): recurring rows collapse by `(reason, weekday, resource)`, one-offs keep
 * their date. Availability only contributes under `planning.teacher-availability`;
 * the whole sweep rides under `settings.center-hours` (every plan). Scoped to one
 * center, today-and-forward (UTC civil date from the injected `Clock`).
 *
 * `recurringSlotWarnings` (SOU-296bis) separately covers weekly templates whose
 * own weekday/window an availability edit now violates, via
 * {@link findStrandedRecurringSlots} — a weekly slot has no `sessions` row until
 * someone runs the generator for it, so without this second pass a freshly
 * created or freshly-orphaned template stays invisible to the standing audit no
 * matter how many times it re-runs.
 */
export class AuditSessionsOutsideEffectiveHours {
  constructor(private readonly deps: AuditSessionsDeps) {}

  async execute(
    input: AuditSessionsOutsideEffectiveHoursInput,
  ): Promise<AuditSessionsOutsideEffectiveHoursResult> {
    this.deps.plan.require('settings.center-hours');

    const today = this.deps.clock.now().toISOString().slice(0, 10);
    const [sessions, holidays, week, overrides] = await Promise.all([
      this.deps.occurrences.listActiveOccurrenceViews(input.centerCode, today),
      this.deps.holidays.listActive(input.centerCode),
      this.deps.centerHours.listForCenter(input.centerCode),
      this.deps.overrides.listForCenter(input.centerCode),
    ]);

    const staticDayByWeekday = new Map<WeekdayIndex, DayHours>(
      resolveWeek(week).map((day) => [day.dayOfWeek, day]),
    );
    const [availabilityByTeacher, enrollmentByGroup, weeklySessions] = await Promise.all([
      this.loadAvailability(input.centerCode, sessions, today),
      this.loadEnrollmentCounts(sessions),
      this.deps.weeklySessions.listWeekView(input.centerCode),
    ]);
    const { byDateRoom, byDateTeacher } = buildResourceScheduleIndex(sessions);

    const stranded: StrandedSession[] = [];
    for (const session of sessions) {
      const reasons = auditReasonsFor(session, {
        holidays,
        overrides,
        staticDayByWeekday,
        availabilityByTeacher,
        roomScheduleIndex: byDateRoom,
        teacherScheduleIndex: byDateTeacher,
        enrollmentByGroup,
      });
      if (reasons.length > 0) stranded.push({ session, reasons });
    }

    return {
      groups: groupStrandedSessions(stranded),
      recurringSlotWarnings: findStrandedRecurringSlots(weeklySessions, availabilityByTeacher),
    };
  }

  /** Live enrollment count per group the occurrences reference, one batch read
   *  (SOU-127 pattern) — the room-over-capacity numerator. Groups absent from the
   *  map default to 0 inside {@link auditReasonsFor}. */
  private async loadEnrollmentCounts(
    sessions: readonly SessionOccurrenceView[],
  ): Promise<ReadonlyMap<GroupId, number>> {
    const groupIds = [
      ...new Set(sessions.map((session) => session.groupId).filter((id): id is GroupId => id !== null)),
    ];
    if (groupIds.length === 0) return new Map();
    return this.deps.enrollments.countActiveByGroups(groupIds);
  }

  /**
   * The declared availability of every teacher staffing an audited occurrence OR
   * a live weekly template, folded per teacher. Empty — every teacher
   * unrestricted — when the plan lacks `planning.teacher-availability`; a teacher
   * with no row is absent from the map. Not gated on `sessions.length`: a center
   * can have zero materialized occurrences yet still have weekly templates the
   * recurring-slot sweep needs this same map for (SOU-296bis).
   */
  private async loadAvailability(
    centerCode: CenterCode,
    sessions: readonly SessionOccurrenceView[],
    today: string,
  ): Promise<ReadonlyMap<EntityId, TeacherAvailabilityRules>> {
    const rulesByTeacher = new Map<EntityId, TeacherAvailabilityRules>();
    if (!this.deps.plan.has('planning.teacher-availability')) {
      return rulesByTeacher;
    }

    const lastDate = sessions.reduce((latest, session) => (session.date > latest ? session.date : latest), today);
    const [rows, exceptionRows] = await Promise.all([
      this.deps.availability.listForCenter(centerCode),
      this.deps.availabilityExceptions.listOverlapping(centerCode, today, lastDate),
    ]);
    for (const row of rows) {
      rulesByTeacher.set(toEntityId(row.teacherId), { weeklyWindows: row.weeklyWindows, exceptions: [] });
    }
    for (const exception of exceptionRows) {
      const teacherId = toEntityId(exception.teacherId);
      const rules = rulesByTeacher.get(teacherId) ?? { weeklyWindows: null, exceptions: [] };
      rulesByTeacher.set(teacherId, {
        weeklyWindows: rules.weeklyWindows,
        exceptions: [...rules.exceptions, exception.dateRange],
      });
    }
    return rulesByTeacher;
  }
}
