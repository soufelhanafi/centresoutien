import type { SessionOccurrenceViewReadPort } from '../ports/session-occurrence-view-read-port';
import type { Clock } from '../ports/clock';
import type { HolidayRepository } from '../ports/holiday-repository';
import type { CenterHoursRepository } from '../ports/center-hours-repository';
import type { CenterHoursOverrideRepository } from '../ports/center-hours-override-repository';
import type { TeacherAvailabilityRepository } from '../ports/teacher-availability-repository';
import type { TeacherAvailabilityExceptionRepository } from '../ports/teacher-availability-exception-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import { toEntityId, type CenterCode, type EntityId } from '../value-objects/ids';
import type { SessionOccurrenceView } from '../read-models/session-occurrence-view';
import type { HolidayOccurrence } from '../policies/holiday-policy';
import type { CenterHoursOverride } from '../entities/center-hours-override';
import type { DayHours } from '../policies/session-conflict-policy';
import type { TeacherAvailabilityRules } from '../policies/teacher-availability-policy';
import type { WeekdayIndex } from '../value-objects/weekday';
import { SessionConflictPolicy } from '../policies/session-conflict-policy';
import { resolveEffectiveWindows } from '../policies/center-hours-override-policy';
import { holidayOn } from '../policies/holiday-policy';
import { teacherUnavailability } from '../policies/teacher-availability-policy';
import { weekdayOf } from '../value-objects/date-range';
import { resolveWeek } from '../schemas/center-hours';

/**
 * Why a materialized session no longer sits in any valid window. A stranded
 * occurrence carries exactly one reason, in precedence order: `on-holiday` wins
 * when a holiday now covers its date (the center is closed the whole day, so its
 * opening windows are moot), then `outside-center-hours` when its fixed
 * `[start, end]` no longer fits the effective windows resolved for that date,
 * then `outside-teacher-availability` (SOU-283) when the session's teacher is now
 * scheduled outside their declared weekly windows or on a one-off absence — the
 * drift a later availability edit opens up, surfaced here so a forced or
 * newly-invalid placement is still visible in the audit.
 */
export type SessionAuditReason =
  | 'outside-center-hours'
  | 'on-holiday'
  | 'outside-teacher-availability';

/**
 * One occurrence the audit flags: the enriched {@link SessionOccurrenceView}
 * (display-ready — room/teacher/subject/group names, level, kind, and the raw
 * date/time) paired with the reason it is now stranded.
 */
export type StrandedSession = {
  session: SessionOccurrenceView;
  reason: SessionAuditReason;
};

export type AuditSessionsOutsideEffectiveHoursResult = {
  sessionsOutsideEffectiveHours: StrandedSession[];
};

export type AuditSessionsOutsideEffectiveHoursInput = {
  centerCode: CenterCode;
};

/**
 * Read-only, center-wide sweep (SOU-201) that reports every live materialized
 * session the *current* effective center hours or holidays now place outside any
 * valid window — the drift that opens up when a center-hours override (SOU-165)
 * or a holiday (SOU-161) is added *after* the sessions were generated. It never
 * mutates or deletes: cancelling a stranded occurrence is `CancelSession`, the
 * separate per-occurrence soft-delete; this only surfaces the candidates.
 *
 * It reads enriched occurrences through {@link SessionOccurrenceViewReadPort} so
 * each result already carries the display fields the report renders (room,
 * teacher, subject, group, level, kind) — the renderer never re-joins. That port
 * also excludes cancelled (soft-deleted) rows, so a just-cancelled occurrence
 * never reappears in the next audit.
 *
 * The verdict per occurrence reuses the same policy logic interactive scheduling
 * already trusts, never a parallel reimplementation:
 * - {@link holidayOn} decides the holiday case (fixed vs lunar recurrence math),
 * - {@link resolveEffectiveWindows} resolves the date's windows with override
 *   precedence over static hours (an override covering the date wins; otherwise
 *   the static weekday hours apply; `null` means no hours constraint for that
 *   date). The static week is first normalized through {@link resolveWeek} — the
 *   same shared fallback the generator uses — so a fresh center with no persisted
 *   `CenterHours` rows audits against the default 09:00–18:00 week rather than
 *   reading as unconstrained (which would false-clean out-of-default occurrences),
 *   and
 * - {@link SessionConflictPolicy.withinWindows} performs the pure fit test.
 *
 * Holiday takes precedence over hours, and hours over teacher availability
 * (SOU-283), so each stranded occurrence carries one unambiguous reason,
 * mirroring the generator's own order (it skips a holiday date before ever
 * hours-checking it). The `outside-teacher-availability` verdict reuses the same
 * {@link teacherUnavailability} policy interactive scheduling trusts and only runs
 * when the plan holds `planning.teacher-availability` — a teacher with no
 * configured row (absent from the folded map) stays unrestricted, while a
 * whole-week-empty row strands every one of that teacher's occurrences. Scoped to
 * one center; the reads never cross a tenant boundary. Rides under
 * `settings.center-hours` (every plan) — the audit exists to explain the effect of
 * a center-hours/holiday/availability change, so it shares that feature's gate
 * rather than adding a new flag.
 *
 * The sweep is bounded to today-and-forward (UTC civil date from the injected
 * `Clock`): the report is a call to action on sessions that will still happen,
 * so a past occurrence — which may already carry recorded attendance — is never
 * surfaced or offered for cancellation. That floor is passed to the read port and
 * applied in SQL, so history is never materialized just to be discarded.
 */
export class AuditSessionsOutsideEffectiveHours {
  constructor(
    private readonly occurrences: SessionOccurrenceViewReadPort,
    private readonly holidays: HolidayRepository,
    private readonly centerHours: CenterHoursRepository,
    private readonly overrides: CenterHoursOverrideRepository,
    private readonly availability: TeacherAvailabilityRepository,
    private readonly availabilityExceptions: TeacherAvailabilityExceptionRepository,
    private readonly plan: PlanPolicy,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: AuditSessionsOutsideEffectiveHoursInput,
  ): Promise<AuditSessionsOutsideEffectiveHoursResult> {
    this.plan.require('settings.center-hours');

    const today = this.clock.now().toISOString().slice(0, 10);
    const [sessions, holidays, week, overrides] = await Promise.all([
      this.occurrences.listActiveOccurrenceViews(input.centerCode, today),
      this.holidays.listActive(input.centerCode),
      this.centerHours.listForCenter(input.centerCode),
      this.overrides.listForCenter(input.centerCode),
    ]);

    const staticDayByWeekday = new Map<WeekdayIndex, DayHours>(
      resolveWeek(week).map((day) => [day.dayOfWeek, day]),
    );
    const availabilityByTeacher = await this.loadAvailability(input.centerCode, sessions, today);

    const sessionsOutsideEffectiveHours: StrandedSession[] = [];
    for (const session of sessions) {
      const reason = this.reasonFor(session, holidays, overrides, staticDayByWeekday, availabilityByTeacher);
      if (reason !== null) sessionsOutsideEffectiveHours.push({ session, reason });
    }
    return { sessionsOutsideEffectiveHours };
  }

  /**
   * The declared availability of every teacher staffing an audited occurrence,
   * folded per teacher (weekly windows + the absences overlapping the audit's
   * today-to-last-occurrence span). Empty — every teacher unrestricted — when the
   * plan lacks `planning.teacher-availability`, so the availability reason only
   * appears on plans that sell the feature; a teacher with no row is simply absent
   * from the map. Rows fold in ascending id order, so the greatest id wins, the
   * same projection the write path resolves.
   */
  private async loadAvailability(
    centerCode: CenterCode,
    sessions: readonly SessionOccurrenceView[],
    today: string,
  ): Promise<ReadonlyMap<EntityId, TeacherAvailabilityRules>> {
    const rulesByTeacher = new Map<EntityId, TeacherAvailabilityRules>();
    if (!this.plan.has('planning.teacher-availability') || sessions.length === 0) return rulesByTeacher;

    const lastDate = sessions.reduce((latest, session) => (session.date > latest ? session.date : latest), today);
    const [rows, exceptionRows] = await Promise.all([
      this.availability.listForCenter(centerCode),
      this.availabilityExceptions.listOverlapping(centerCode, today, lastDate),
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

  private reasonFor(
    session: SessionOccurrenceView,
    holidays: readonly HolidayOccurrence[],
    overrides: readonly CenterHoursOverride[],
    staticDayByWeekday: ReadonlyMap<WeekdayIndex, DayHours>,
    availabilityByTeacher: ReadonlyMap<EntityId, TeacherAvailabilityRules>,
  ): SessionAuditReason | null {
    if (holidayOn(session.date, holidays) !== null) return 'on-holiday';
    const weekday = weekdayOf(session.date);
    const staticDay = staticDayByWeekday.get(weekday) ?? null;
    const windows = resolveEffectiveWindows(session.date, weekday, overrides, staticDay);
    if (windows !== null) {
      const outside = SessionConflictPolicy.withinWindows(
        { dayOfWeek: weekday, start: session.start, end: session.end },
        windows,
      );
      if (outside !== null) return 'outside-center-hours';
    }
    if (session.teacherId !== null) {
      const teacherId = toEntityId(session.teacherId);
      const rules = availabilityByTeacher.get(teacherId);
      if (rules !== undefined) {
        const unavailable = teacherUnavailability(
          { dayOfWeek: weekday, start: session.start, end: session.end },
          teacherId,
          rules,
          { start: session.date, end: session.date },
        );
        if (unavailable !== null) return 'outside-teacher-availability';
      }
    }
    return null;
  }
}
